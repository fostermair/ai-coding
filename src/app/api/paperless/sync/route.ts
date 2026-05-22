import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseReweEbon, ParsedReceipt } from "@/lib/parser/rewe"
import { parseLidlEbon } from "@/lib/parser/lidl"
import { parseKauflandEbon } from "@/lib/parser/kaufland"

// ── pdfjs polyfill (same as in /api/import) ────────────────────────────────
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixMinimal {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true
    constructor(_init?: string | number[]) {}
    multiply() { return this }
    inverse() { return this }
    translate(tx = 0, ty = 0) {
      const m = new DOMMatrixMinimal(); m.e = this.e + tx; m.f = this.f + ty; return m
    }
    scale(sx = 1, sy = sx) {
      const m = new DOMMatrixMinimal(); m.a = this.a * sx; m.d = this.d * sy; return m
    }
    transformPoint(p: { x: number; y: number }) {
      return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f }
    }
  }
  // @ts-expect-error
  globalThis.DOMMatrix = DOMMatrixMinimal
}
if (typeof globalThis.ImageData === "undefined") {
  // @ts-expect-error
  globalThis.ImageData = class ImageData { constructor(public width = 0, public height = 0) {} }
}
if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error
  globalThis.Path2D = class Path2D {}
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>

interface SyncDetail {
  title: string
  status: "imported" | "duplicate" | "error" | "reparsed"
  message?: string
}

interface ChainConfig {
  key: "rewe" | "lidl" | "kaufland"
  envVar: string | undefined
  parser: (text: string) => ParsedReceipt
}

export async function POST(request: NextRequest) {
  try {
    // ── Check configuration ────────────────────────────────────────────────
    const baseUrl = process.env.PAPERLESS_URL
    const token = process.env.PAPERLESS_TOKEN
    const documentTypeId = process.env.PAPERLESS_DOCUMENT_TYPE_ID

    if (!baseUrl || !token) {
      return NextResponse.json(
        { configured: false, message: "PAPERLESS_URL und PAPERLESS_TOKEN nicht konfiguriert" },
        { status: 503 }
      )
    }

    const db = getDb()
    let imported = 0
    let duplicates = 0
    let errors = 0
    let reparsed = 0
    const details: SyncDetail[] = []
    const byChain: Record<string, number> = { rewe: 0, lidl: 0, kaufland: 0 }

    const chains: ChainConfig[] = [
      { key: "rewe", envVar: process.env.PAPERLESS_REWE_CORRESPONDENT_ID, parser: parseReweEbon },
      { key: "lidl", envVar: process.env.PAPERLESS_LIDL_CORRESPONDENT_ID, parser: parseLidlEbon },
      {
        key: "kaufland",
        envVar: process.env.PAPERLESS_KAUFLAND_CORRESPONDENT_ID,
        parser: parseKauflandEbon,
      },
    ]

    let baseDocUrl = `${baseUrl}/api/documents/?page_size=100`
    if (documentTypeId) {
      baseDocUrl += `&document_type__id=${documentTypeId}`
    }

    // ── Process each supermarket chain ─────────────────────────────────────
    for (const chain of chains) {
      if (!chain.envVar) continue

      let documentUrl = baseDocUrl + `&correspondent__id=${chain.envVar}`

      // ── Paginated document fetching for this chain ──────────────────────
      let hasNext = true
      while (hasNext) {
        let apiResponse
        try {
          const res = await fetch(documentUrl, {
            headers: { Authorization: `Token ${token}` },
          })

          if (res.status === 401) {
            return NextResponse.json(
              { message: "Auth-Token ungültig. Prüfe PAPERLESS_TOKEN in .env.local" },
              { status: 401 }
            )
          }

          if (!res.ok) {
            return NextResponse.json(
              { message: `paperless-API Fehler: ${res.status} ${res.statusText}` },
              { status: 502 }
            )
          }

          apiResponse = await res.json()
        } catch {
          return NextResponse.json(
            { message: "paperless-ngx nicht erreichbar. Prüfe URL und Netzwerk." },
            { status: 503 }
          )
        }

        const documents = apiResponse.results || []

        for (const doc of documents) {
          const docTitle = doc.title || `Document ${doc.id}`
          const docId = doc.id

          try {
            // ── Download PDF ─────────────────────────────────────────────────
            let pdfBuffer
            try {
              const pdfRes = await fetch(`${baseUrl}/api/documents/${docId}/download/`, {
                headers: { Authorization: `Token ${token}` },
              })

              if (!pdfRes.ok) {
                errors++
                details.push({
                  title: docTitle,
                  status: "error",
                  message: `PDF-Download fehlgeschlagen (${pdfRes.status})`,
                })
                continue
              }

              pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
            } catch {
              errors++
              details.push({
                title: docTitle,
                status: "error",
                message: "PDF-Download Netzwerkfehler",
              })
              continue
            }

            // ── Extract text from PDF ────────────────────────────────────────
            let pdfText: string
            try {
              const data = await pdfParse(pdfBuffer)
              pdfText = data.text
            } catch {
              errors++
              details.push({
                title: docTitle,
                status: "error",
                message: "PDF konnte nicht gelesen werden",
              })
              continue
            }

            if (!pdfText || pdfText.trim().length < 50) {
              errors++
              details.push({
                title: docTitle,
                status: "error",
                message: "PDF enthält keinen lesbaren Text",
              })
              continue
            }

            // ── Parse with chain-specific parser ──────────────────────────────
            let parsed
            try {
              parsed = chain.parser(pdfText)
            } catch (e) {
              errors++
              const msg = e instanceof Error ? e.message : "Format nicht erkannt"
              logImport(`[paperless] ${docTitle}`, "error", msg)
              details.push({
                title: docTitle,
                status: "error",
                message: msg,
              })
              continue
            }

            // ── Duplicate check / needs_reparse handling ──────────────────────
            const existing = db
              .prepare(
                "SELECT id, needs_reparse FROM receipts WHERE receipt_nr = ? AND market_nr = ? AND receipt_date = ? AND store_chain = ?"
              )
              .get(parsed.receiptNr, parsed.marketNr, parsed.receiptDate, chain.key) as
              | { id: number; needs_reparse: number }
              | undefined

            if (existing) {
              if (!existing.needs_reparse) {
                // Normal duplicate — skip
                duplicates++
                logImport(`[paperless] ${docTitle}`, "duplicate", `Bon-Nr. ${parsed.receiptNr}`)
                details.push({
                  title: docTitle,
                  status: "duplicate",
                })
                continue
              }

              // needs_reparse=1 — delete old items and re-insert with new parser
              const doReparse = db.transaction(() => {
                db.prepare("DELETE FROM avis_matches WHERE receipt_id = ?").run(existing.id)
                db.prepare("DELETE FROM receipt_items WHERE receipt_id = ?").run(existing.id)

                const insertItem = db.prepare(`
                  INSERT INTO receipt_items
                    (receipt_id, raw_name, item_type, quantity, unit_price_cents,
                     total_price_cents, tax_code, bonus_excluded, concessionaire_code, position)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `)
                const insertDiscount = db.prepare(
                  "INSERT INTO item_discounts (receipt_item_id, description, amount_cents, tax_code) VALUES (?, ?, ?, ?)"
                )

                for (const item of parsed.items) {
                  const { lastInsertRowid: itemId } = insertItem.run(
                    existing.id,
                    item.rawName,
                    item.itemType,
                    item.quantity,
                    item.unitPriceCents,
                    item.totalPriceCents,
                    item.taxCode,
                    item.bonusExcluded ? 1 : 0,
                    item.concessionaireCode ?? null,
                    item.position
                  )
                  for (const d of item.discounts) {
                    insertDiscount.run(itemId, d.description, d.amountCents, d.taxCode)
                  }
                }

                db.prepare("UPDATE receipts SET needs_reparse = 0, filename = ?, paperless_doc_id = ? WHERE id = ?").run(
                  `[paperless] ${docTitle}`,
                  docId,
                  existing.id
                )

                db.prepare(
                  "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
                ).run(
                  `[paperless] ${docTitle}`,
                  "reparsed",
                  `${parsed.items.length} Positionen neu geparst`
                )
              })

              doReparse()
              reparsed++
              byChain[chain.key]++
              details.push({
                title: docTitle,
                status: "reparsed",
              })
              continue
            }

            // ── Insert in transaction ────────────────────────────────────────
            const insertReceipt = db.prepare(`
              INSERT INTO receipts
                (filename, store_name, store_address, store_uid, market_nr, receipt_nr,
                 receipt_date, receipt_time, payment_method, total_amount_cents, paperless_doc_id, store_chain)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const insertItem = db.prepare(`
              INSERT INTO receipt_items
                (receipt_id, raw_name, item_type, quantity, unit_price_cents,
                 total_price_cents, tax_code, bonus_excluded, concessionaire_code, position)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const insertDiscount = db.prepare(`
              INSERT INTO item_discounts (receipt_item_id, description, amount_cents, tax_code)
              VALUES (?, ?, ?, ?)
            `)

            const insertLog = db.prepare(
              "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
            )

            const doInsert = db.transaction(() => {
              const { lastInsertRowid: receiptId } = insertReceipt.run(
                `[paperless] ${docTitle}`,
                parsed.storeName,
                parsed.storeAddress,
                parsed.storeUid,
                parsed.marketNr,
                parsed.receiptNr,
                parsed.receiptDate,
                parsed.receiptTime,
                parsed.paymentMethod,
                parsed.totalAmountCents,
                docId,
                chain.key
              )

              for (const item of parsed.items) {
                const { lastInsertRowid: itemId } = insertItem.run(
                  receiptId,
                  item.rawName,
                  item.itemType,
                  item.quantity,
                  item.unitPriceCents,
                  item.totalPriceCents,
                  item.taxCode,
                  item.bonusExcluded ? 1 : 0,
                  item.concessionaireCode ?? null,
                  item.position
                )
                for (const d of item.discounts) {
                  insertDiscount.run(itemId, d.description, d.amountCents, d.taxCode)
                }
              }

              insertLog.run(
                `[paperless] ${docTitle}`,
                "success",
                `${parsed.items.length} Positionen importiert`
              )
              return receiptId
            })

            doInsert()
            imported++
            byChain[chain.key]++
            details.push({
              title: docTitle,
              status: "imported",
            })
          } catch (e) {
            errors++
            const msg = e instanceof Error ? e.message : "Unbekannter Fehler"
            logImport(`[paperless] ${docTitle}`, "error", msg)
            details.push({
              title: docTitle,
              status: "error",
              message: msg,
            })
          }
        }

        // ── Check for next page ────────────────────────────────────────────────
        if (apiResponse.next) {
          documentUrl = apiResponse.next
        } else {
          hasNext = false
        }
      }
    }

    // ── Return summary ─────────────────────────────────────────────────────
    if (imported === 0 && duplicates === 0 && errors === 0 && reparsed === 0) {
      return NextResponse.json({
        imported: 0,
        duplicates: 0,
        reparsed: 0,
        errors: 0,
        details: [],
        byChain: { rewe: 0, lidl: 0, kaufland: 0 },
        message: "Keine neuen eBons gefunden",
      })
    }

    return NextResponse.json({
      imported,
      duplicates,
      reparsed,
      errors,
      details,
      byChain,
    })
  } catch (e) {
    console.error("[/api/paperless/sync] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Sync" }, { status: 500 })
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function logImport(filename: string, status: string, message: string): void {
  try {
    const db = getDb()
    db.prepare("INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)").run(
      filename,
      status,
      message
    )
  } catch {
    // Non-critical – don't let log failures break the response
  }
}
