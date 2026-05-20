import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseAvis } from "@/lib/parser/avis"

// pdfjs polyfill (same as in /api/avis/import)
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

export async function POST(request: NextRequest) {
  try {
    // Check configuration
    const baseUrl = process.env.PAPERLESS_URL
    const token = process.env.PAPERLESS_TOKEN
    const avisTag = process.env.PAPERLESS_AVIS_TAG
    const avisCorrespondentId = process.env.PAPERLESS_AVIS_CORRESPONDENT_ID
    const avisDocumentTypeId = process.env.PAPERLESS_AVIS_DOCUMENT_TYPE_ID

    if (!baseUrl || !token) {
      return NextResponse.json(
        { configured: false, message: "PAPERLESS_URL und PAPERLESS_TOKEN nicht konfiguriert" },
        { status: 503 }
      )
    }

    if (!avisTag && !avisCorrespondentId) {
      return NextResponse.json(
        {
          configured: false,
          message: "PAPERLESS_AVIS_TAG oder PAPERLESS_AVIS_CORRESPONDENT_ID nicht konfiguriert",
        },
        { status: 503 }
      )
    }

    const db = getDb()
    let imported = 0
    let duplicates = 0
    let errors = 0
    const details: SyncDetail[] = []

    // Build API URL
    let documentUrl = `${baseUrl}/api/documents/?page_size=100`
    if (avisTag) {
      documentUrl += `&tags__id__in=${avisTag}`
    }
    if (avisCorrespondentId) {
      documentUrl += `&correspondent__id=${avisCorrespondentId}`
    }
    if (avisDocumentTypeId) {
      documentUrl += `&document_type__id=${avisDocumentTypeId}`
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
            const pdfRes = await fetch(`${baseUrl}/api/documents/${docId}/download/?original=true`, {
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

          // Parse AVIS
          let parsed
          try {
            parsed = parseAvis(pdfText)
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

          // Check for duplicate
          const existingImport = db
            .prepare("SELECT id FROM import_log WHERE filename LIKE ? AND status = 'success'")
            .get(`%[AVIS] ${parsed.orderNumber}%`) as { id: number } | undefined

          if (existingImport) {
            duplicates++
            details.push({
              title: docTitle,
              status: "duplicate",
              message: `Bestellnummer ${parsed.orderNumber}`,
            })
            continue
          }

          // Get eBon items for matching
          interface EbonItem {
            raw_name: string
            quantity: number
            unit_price_cents: number
            date: string
          }
          const ebonItems = db
            .prepare(
              `SELECT raw_name, quantity, unit_price_cents,
                      (SELECT receipt_date FROM receipts WHERE receipts.id = receipt_items.receipt_id) as date
               FROM receipt_items
               WHERE item_type = 'product'
               ORDER BY date DESC`
            )
            .all() as EbonItem[]

          // Match and set aliases (same logic as /api/avis/import)
          let autoSetCount = 0
          const setAliasStmt = db.prepare(
            "INSERT OR IGNORE INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))"
          )

          const transaction = db.transaction(() => {
            for (const avisItem of parsed.items) {
              if (avisItem.status !== "available") continue

              // Find best match
              let bestMatch = null
              let bestConfidence = 0

              for (const ebonItem of ebonItems) {
                const confidence = calculateConfidence(avisItem, ebonItem, parsed.pickupDate)
                if (confidence > bestConfidence) {
                  bestConfidence = confidence
                  bestMatch = ebonItem
                }
              }

              if (bestMatch && bestConfidence >= 80) {
                const existing = db
                  .prepare("SELECT alias FROM product_aliases WHERE raw_name = ?")
                  .get(bestMatch.raw_name) as { alias: string } | undefined

                if (!existing || !existing.alias) {
                  setAliasStmt.run(bestMatch.raw_name, avisItem.name)
                  autoSetCount++
                }
              }
            }

            // Log import
            const logStmt = db.prepare(
              "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
            )
            logStmt.run(
              `[AVIS] ${parsed.orderNumber}`,
              "success",
              `${autoSetCount} Aliases automatisch gesetzt (via Paperless)`
            )
          })

          transaction()

          imported++
          details.push({
            title: docTitle,
            status: "imported",
            message: `${autoSetCount} Aliases gesetzt`,
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
        message: "Keine neuen AVISe gefunden",
        auto_set: 0,
        pending_approval: 0,
      })
    }

    return NextResponse.json({
      imported,
      duplicates,
      errors,
      details,
      auto_set: imported,
      pending_approval: 0,
    })
  } catch (e) {
    console.error("[/api/paperless/avis-sync] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Sync" }, { status: 500 })
  }
}

function calculateConfidence(avisItem: any, ebonItem: any, avisDate: string): number {
  let confidence = 0

  // Date matching
  const avisDateObj = new Date(avisDate)
  const ebonDateObj = new Date(ebonItem.date)
  const dayDiff = Math.abs((avisDateObj.getTime() - ebonDateObj.getTime()) / (1000 * 60 * 60 * 24))
  if (dayDiff <= 1) confidence += 40

  // Price matching
  const priceDiff = Math.abs(avisItem.unitPrice - ebonItem.unit_price_cents)
  if (priceDiff <= 2) confidence += 40

  // Quantity matching
  const isWeightItem = avisItem.qty < 10 && avisItem.unitPrice > 50
  if (!isWeightItem) {
    if (avisItem.qty === ebonItem.quantity) confidence += 20
    else if (Math.abs(avisItem.qty - ebonItem.quantity) / ebonItem.quantity <= 0.1) confidence += 10
  } else {
    if (priceDiff <= 2) confidence += 10
  }

  // Fuzzy name match
  const similarity = levenshteinSimilarity(avisItem.name.toLowerCase(), ebonItem.raw_name.toLowerCase())
  if (similarity > 0.7) confidence += 20
  else if (similarity > 0.5) confidence += 10

  return Math.min(100, confidence)
}

function levenshteinSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) return 1
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = []
  for (let k = 0; k <= s2.length; k++) costs[k] = k
  let prevDiag = 0
  for (let i = 1; i <= s1.length; i++) {
    let subs = costs[0]
    costs[0] = i
    for (let j = 1; j <= s2.length; j++) {
      const tmp = costs[j]
      costs[j] = Math.min(costs[j] + 1, costs[j - 1] + 1, subs + (s1[i - 1] === s2[j - 1] ? 0 : 1))
      subs = tmp
    }
    prevDiag = subs
  }
  return costs[s2.length]
}
