import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseKontoauszug } from "@/lib/parser/konto"

// ── pdfjs polyfill ─────────────────────────────────────────────────────────
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
  // @ts-expect-error – polyfill
  globalThis.DOMMatrix = DOMMatrixMinimal
}
if (typeof globalThis.ImageData === "undefined") {
  // @ts-expect-error – polyfill
  globalThis.ImageData = class ImageData { constructor(public width = 0, public height = 0) {} }
}
if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error – polyfill
  globalThis.Path2D = class Path2D {}
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>

export async function POST(request: NextRequest) {
  try {
    const baseUrl = process.env.PAPERLESS_URL
    const token = process.env.PAPERLESS_TOKEN
    const docTypeId = process.env.PAPERLESS_KONTO_DOCUMENT_TYPE_ID

    if (!baseUrl || !token) {
      return NextResponse.json(
        { configured: false, message: "PAPERLESS_URL und PAPERLESS_TOKEN nicht konfiguriert" },
        { status: 503 }
      )
    }

    if (!docTypeId) {
      return NextResponse.json(
        { configured: false, message: "PAPERLESS_KONTO_DOCUMENT_TYPE_ID nicht konfiguriert" },
        { status: 503 }
      )
    }

    const db = getDb()
    let imported = 0
    let duplicates = 0
    let errors = 0
    const details: Array<{ title: string; status: string; message?: string }> = []

    const correspondentId = process.env.PAPERLESS_KONTO_CORRESPONDENT_ID
    let documentUrl = `${baseUrl}/api/documents/?page_size=100&document_type__id=${docTypeId}`
    if (correspondentId) {
      documentUrl += `&correspondent__id=${correspondentId}`
    }
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

        try {
          // Download PDF
          const pdfRes = await fetch(`${baseUrl}/api/documents/${doc.id}/download/`, {
            headers: { Authorization: `Token ${token}` },
          })
          if (!pdfRes.ok) {
            errors++
            details.push({ title: docTitle, status: "error", message: `PDF-Download fehlgeschlagen (${pdfRes.status})` })
            continue
          }

          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())

          let pdfText: string
          try {
            const data = await pdfParse(pdfBuffer)
            pdfText = data.text
          } catch {
            errors++
            details.push({ title: docTitle, status: "error", message: "PDF konnte nicht gelesen werden" })
            continue
          }

          // Parse
          let parsed
          try {
            parsed = parseKontoauszug(pdfText)
          } catch (e) {
            errors++
            const msg = e instanceof Error ? e.message : "Format nicht erkannt"
            logImport(`[paperless] ${docTitle}`, "error", msg)
            details.push({ title: docTitle, status: "error", message: msg })
            continue
          }

          // Duplicate check
          const existing = db
            .prepare("SELECT id, paperless_doc_id FROM bank_statement_log WHERE konto_iban = ? AND periode = ?")
            .get(parsed.konto_iban, parsed.periode) as { id: number; paperless_doc_id: number | null } | undefined

          if (existing) {
            if (!existing.paperless_doc_id) {
              db.prepare("UPDATE bank_statement_log SET paperless_doc_id = ? WHERE id = ?")
                .run(doc.id, existing.id)
            }
            duplicates++
            details.push({ title: docTitle, status: "duplicate" })
            continue
          }

          // Insert
          const insertTx = db.prepare(`
            INSERT OR IGNORE INTO bank_transactions
              (buchungsdatum, valutadatum, typ, beschreibung, haendler_name,
               empfaenger_name, verwendungszweck, iban, bic, betrag_cents,
               kontoauszug_datei, periode, konto_iban)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
          `)

          let txImported = 0
          db.transaction(() => {
            for (const tx of parsed.transactions) {
              const result = insertTx.run(
                tx.buchungsdatum, tx.valutadatum, tx.typ, tx.beschreibung,
                tx.haendler_name, tx.empfaenger_name, tx.verwendungszweck,
                tx.iban, tx.bic, tx.betrag_cents,
                `[paperless] ${docTitle}`, parsed.periode, parsed.konto_iban
              )
              if (result.changes > 0) txImported++
            }
            db.prepare("INSERT INTO bank_statement_log (konto_iban, periode, dateiname, transaktion_count, paperless_doc_id) VALUES (?,?,?,?,?)")
              .run(parsed.konto_iban, parsed.periode, `[paperless] ${docTitle}`, txImported, doc.id)
          })()

          imported++
          logImport(`[paperless] ${docTitle}`, "success", `${txImported} Transaktionen importiert`)
          details.push({ title: docTitle, status: "imported" })
        } catch (e) {
          errors++
          const msg = e instanceof Error ? e.message : "Unbekannter Fehler"
          details.push({ title: docTitle, status: "error", message: msg })
        }
      }

      hasNext = !!apiResponse.next
      if (apiResponse.next) documentUrl = apiResponse.next
    }

    // Trigger matching if anything was imported
    if (imported > 0) {
      try {
        await fetch(new URL("/api/konto/match", request.url), { method: "POST" })
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({ imported, duplicates, errors, details })
  } catch (e) {
    console.error("[/api/konto/paperless-sync] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Sync" }, { status: 500 })
  }
}

function logImport(filename: string, status: string, message: string): void {
  try {
    const db = getDb()
    db.prepare("INSERT INTO import_log (filename, status, message) VALUES (?,?,?)").run(filename, status, message)
  } catch {
    // Non-critical
  }
}
