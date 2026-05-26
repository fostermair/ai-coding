import { NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getDb } from "@/lib/db"
import { parseBestellung } from "@/lib/parser/bestellung"

// pdfjs polyfill (same as in other sync endpoints)
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
  status: "imported" | "duplicate" | "error"
  message?: string
}

const BESTELLUNG_DIR = path.join(process.cwd(), "data", "bestellungen")

export async function POST(request: NextRequest) {
  try {
    // Check configuration
    const baseUrl = process.env.PAPERLESS_URL
    const token = process.env.PAPERLESS_TOKEN
    const bestellungTag = process.env.PAPERLESS_BESTELLUNG_TAG
    const bestellungCorrespondentId = process.env.PAPERLESS_BESTELLUNG_CORRESPONDENT_ID
    const bestellungDocumentTypeId = process.env.PAPERLESS_BESTELLUNG_DOCUMENT_TYPE_ID

    if (!baseUrl || !token) {
      return NextResponse.json(
        { configured: false, message: "PAPERLESS_URL und PAPERLESS_TOKEN nicht konfiguriert" },
        { status: 503 }
      )
    }

    if (!bestellungTag && !bestellungCorrespondentId) {
      return NextResponse.json(
        {
          configured: false,
          message:
            "PAPERLESS_BESTELLUNG_TAG oder PAPERLESS_BESTELLUNG_CORRESPONDENT_ID nicht konfiguriert",
        },
        { status: 503 }
      )
    }

    // Create bestellungen directory if not exists
    if (!fs.existsSync(BESTELLUNG_DIR)) {
      fs.mkdirSync(BESTELLUNG_DIR, { recursive: true })
    }

    const db = getDb()
    let imported = 0
    let duplicates = 0
    let errors = 0
    const details: SyncDetail[] = []

    // Build API URL
    let documentUrl = `${baseUrl}/api/documents/?page_size=100`
    if (bestellungTag) {
      documentUrl += `&tags__id__in=${bestellungTag}`
    }
    if (bestellungCorrespondentId) {
      documentUrl += `&correspondent__id=${bestellungCorrespondentId}`
    }
    if (bestellungDocumentTypeId) {
      documentUrl += `&document_type__id=${bestellungDocumentTypeId}`
    }

    // Fetch documents
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
          // Download PDF
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

          // Extract text from PDF
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

          // Parse Bestellbestätigung
          let parsed
          try {
            parsed = parseBestellung(pdfText)
          } catch (e) {
            errors++
            const msg = e instanceof Error ? e.message : "Format nicht erkannt"
            details.push({
              title: docTitle,
              status: "error",
              message: msg,
            })
            continue
          }

          // Check for duplicate (by order_number)
          const existingBestellung = db
            .prepare("SELECT id FROM bestellung_items WHERE order_number = ? LIMIT 1")
            .get(parsed.orderNumber) as { id: number } | undefined

          if (existingBestellung) {
            duplicates++
            details.push({
              title: docTitle,
              status: "duplicate",
              message: `Bestellnummer ${parsed.orderNumber} bereits importiert`,
            })
            continue
          }

          // Save PDF to disk
          const sanitizedFilename = `bestellung_${parsed.orderNumber}_${Date.now()}.pdf`
          const filePath = path.join(BESTELLUNG_DIR, sanitizedFilename)
          fs.writeFileSync(filePath, pdfBuffer)

          // Insert in transaction
          const insertLog = db.prepare(
            "INSERT INTO import_log (filename, status, message, pdf_path, paperless_doc_id) VALUES (?, ?, ?, ?, ?)"
          )

          const insertBestellungItem = db.prepare(`
            INSERT INTO bestellung_items
              (import_log_id, order_number, article_name, quantity_amount, quantity_unit,
               unit_price_cents, total_price_cents)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)

          const transaction = db.transaction(() => {
            const { lastInsertRowid: importLogId } = insertLog.run(
              `[BESTELLUNG] ${parsed.orderNumber}`,
              "success",
              `${parsed.items.length} Artikel importiert (via Paperless)`,
              filePath,
              docId
            )

            for (const item of parsed.items) {
              insertBestellungItem.run(
                importLogId,
                parsed.orderNumber,
                item.articleName,
                item.quantityAmount,
                item.quantityUnit,
                item.unitPriceCents,
                item.totalPriceCents
              )
            }

            return importLogId
          })

          transaction()

          imported++
          details.push({
            title: docTitle,
            status: "imported",
            message: `${parsed.items.length} Artikel importiert`,
          })
        } catch (e) {
          errors++
          details.push({
            title: docTitle,
            status: "error",
            message: e instanceof Error ? e.message : "Unbekannter Fehler",
          })
        }
      }

      hasNext = !!apiResponse.next
      documentUrl = apiResponse.next || ""
    }

    if (imported + duplicates + errors === 0) {
      return NextResponse.json({
        message: "Keine neuen Bestellbestätigungen gefunden",
        imported: 0,
        duplicates: 0,
        errors: 0,
      })
    }

    return NextResponse.json({
      imported,
      duplicates,
      errors,
      details,
    })
  } catch (e) {
    console.error("[/api/paperless/bestellung-sync] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Sync" }, { status: 500 })
  }
}
