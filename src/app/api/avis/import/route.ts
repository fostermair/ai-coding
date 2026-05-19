import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseAvis } from "@/lib/parser/avis"

// pdfjs polyfill (copy from /api/import)
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

interface MatchResult {
  avisName: string
  avisQty: number
  avisPrice: number
  ebonRawName: string
  ebonQty: number
  ebonPrice: number
  ebonDate: string
  confidence: number
}

interface AvisImportResponse {
  auto_set: number
  pending_approval: number
  unmatched: number
  errors: number
  pending_matches: MatchResult[]
  unmatched_items: Array<{ name: string; price: number; date: string }>
  import_log_id: string
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

function calculateMatchConfidence(
  avisItem: { qty: number; unitPrice: number; name: string },
  ebonItem: { qty: number; unitPrice: number; rawName: string; date: string },
  avisDate: string
): number {
  let confidence = 0

  // Date matching: ±1 day (40 points)
  const avisDateObj = new Date(avisDate)
  const ebonDateObj = new Date(ebonItem.date)
  const dayDiff = Math.abs((avisDateObj.getTime() - ebonDateObj.getTime()) / (1000 * 60 * 60 * 24))
  if (dayDiff <= 1) {
    confidence += 40
  }

  // Price matching: ±2 cents (40 points)
  const priceDiff = Math.abs(avisItem.unitPrice - ebonItem.unitPrice)
  if (priceDiff <= 2) {
    confidence += 40
  }

  // Quantity matching (20 points)
  // Check if it's a weight item (quantity < 10 usually means weight in grams)
  const isWeightItem = avisItem.qty < 10 && avisItem.unitPrice > 50 // Heuristic: weight items have higher unit prices
  if (!isWeightItem) {
    if (avisItem.qty === ebonItem.qty) {
      confidence += 20
    } else if (Math.abs(avisItem.qty - ebonItem.qty) / ebonItem.qty <= 0.1) {
      confidence += 10
    }
  } else {
    // For weight items, only use price match
    if (priceDiff <= 2) {
      confidence += 10
    }
  }

  // Fuzzy name matching: tiebreaker (0-20 points)
  const similarity = levenshteinSimilarity(avisItem.name.toLowerCase(), ebonItem.rawName.toLowerCase())
  if (similarity > 0.7) {
    confidence += 20
  } else if (similarity > 0.5) {
    confidence += 10
  }

  return Math.min(100, confidence)
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: "Keine PDF-Datei erhalten" }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ message: "Nur PDF-Dateien werden akzeptiert" }, { status: 400 })
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "PDF-Datei ist zu groß (max. 10 MB)" },
        { status: 400 }
      )
    }

    // Extract text from PDF
    const buffer = Buffer.from(await file.arrayBuffer())
    let pdfText: string
    try {
      const data = await pdfParse(buffer)
      pdfText = data.text
    } catch {
      return NextResponse.json({ message: "PDF konnte nicht gelesen werden" }, { status: 422 })
    }

    if (!pdfText || pdfText.trim().length < 50) {
      return NextResponse.json(
        { message: "PDF enthält keinen lesbaren Text" },
        { status: 422 }
      )
    }

    // Parse AVIS
    let parsed
    try {
      parsed = parseAvis(pdfText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AVIS-Format nicht erkannt"
      logImport(file.name, "error", msg)
      return NextResponse.json({ message: msg }, { status: 422 })
    }

    const db = getDb()

    // Duplicate check: check if AVIS with same order number was already imported
    const existingImport = db
      .prepare("SELECT id FROM import_log WHERE filename LIKE ? AND status = 'success'")
      .get(`%[AVIS] ${parsed.orderNumber}%`) as { id: number } | undefined

    if (existingImport) {
      const msg = `AVIS bereits importiert (Bestellnummer ${parsed.orderNumber})`
      logImport(file.name, "duplicate", msg)
      return NextResponse.json({ message: msg }, { status: 409 })
    }

    // Fetch all eBon items from DB to match against
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

    // Match AVIS items with eBon items
    const autoSet: MatchResult[] = []
    const pendingMatches: MatchResult[] = []
    const unmatchedItems: Array<{ name: string; price: number; date: string }> = []
    let errors = 0

    for (const avisItem of parsed.items) {
      // Skip non-available items for matching (but still include in results)
      if (avisItem.status !== "available") {
        unmatchedItems.push({
          name: avisItem.name,
          price: avisItem.unitPrice,
          date: parsed.pickupDate,
        })
        continue
      }

      // Find best match among eBon items
      let bestMatch: (typeof ebonItems)[0] | null = null
      let bestConfidence = 0

      for (const ebonItem of ebonItems) {
        const confidence = calculateMatchConfidence(
          {
            qty: avisItem.qty,
            unitPrice: avisItem.unitPrice,
            name: avisItem.name,
          },
          {
            qty: ebonItem.quantity,
            unitPrice: ebonItem.unit_price_cents,
            rawName: ebonItem.raw_name,
            date: ebonItem.date,
          },
          parsed.pickupDate
        )

        if (confidence > bestConfidence) {
          bestConfidence = confidence
          bestMatch = ebonItem
        }
      }

      if (!bestMatch || bestConfidence < 50) {
        // No match found or confidence too low
        unmatchedItems.push({
          name: avisItem.name,
          price: avisItem.unitPrice,
          date: parsed.pickupDate,
        })
        continue
      }

      const match: MatchResult = {
        avisName: avisItem.name,
        avisQty: avisItem.qty,
        avisPrice: avisItem.unitPrice,
        ebonRawName: bestMatch.raw_name,
        ebonQty: bestMatch.quantity,
        ebonPrice: bestMatch.unit_price_cents,
        ebonDate: bestMatch.date,
        confidence: Math.round(bestConfidence),
      }

      if (bestConfidence >= 80) {
        autoSet.push(match)
      } else {
        pendingMatches.push(match)
      }
    }

    // Auto-set aliases for high-confidence matches
    let autoSetCount = 0
    const setAliasStmt = db.prepare(
      "INSERT OR IGNORE INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))"
    )
    const insertMatchStmt = db.prepare(
      `INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const transaction = db.transaction(() => {
      // Log import first to get the import_log_id
      const logStmt = db.prepare(
        "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
      )
      const logResult = logStmt.run(
        `[AVIS] ${parsed.orderNumber}`,
        "success",
        `${autoSet.length} Aliases automatisch gesetzt, ${pendingMatches.length} zu Überprüfung, ${unmatchedItems.length} nicht gematcht`
      )
      const logId = logResult.lastInsertRowid as number

      // Find the receipt_id that matches this AVIS date
      interface ReceiptInfo {
        id: number
      }
      const receipt = db
        .prepare("SELECT id FROM receipts WHERE receipt_date = ? LIMIT 1")
        .get(parsed.pickupDate) as ReceiptInfo | undefined

      if (!receipt) {
        throw new Error(`Kein Bon für AVIS-Datum ${parsed.pickupDate} gefunden`)
      }

      // Process auto-set matches
      for (const match of autoSet) {
        // Only set if alias is empty
        const existing = db
          .prepare("SELECT alias FROM product_aliases WHERE raw_name = ?")
          .get(match.ebonRawName) as { alias: string } | undefined

        if (!existing || !existing.alias) {
          setAliasStmt.run(match.ebonRawName, match.avisName)
          autoSetCount++
        }

        // Find receipt_item_id for this match
        interface ItemInfo {
          id: number
        }
        const item = db
          .prepare("SELECT id FROM receipt_items WHERE receipt_id = ? AND raw_name = ? LIMIT 1")
          .get(receipt.id, match.ebonRawName) as ItemInfo | undefined

        // Insert match record
        insertMatchStmt.run(
          receipt.id,
          item?.id ?? null,
          logId,
          match.avisName,
          match.avisPrice,
          match.confidence,
          "auto_set"
        )
      }

      // Process pending matches
      for (const match of pendingMatches) {
        // Find receipt_item_id for this match
        interface ItemInfo {
          id: number
        }
        const item = db
          .prepare("SELECT id FROM receipt_items WHERE receipt_id = ? AND raw_name = ? LIMIT 1")
          .get(receipt.id, match.ebonRawName) as ItemInfo | undefined

        // Insert match record
        insertMatchStmt.run(
          receipt.id,
          item?.id ?? null,
          logId,
          match.avisName,
          match.avisPrice,
          match.confidence,
          "pending"
        )
      }

      return logId
    })

    const importLogId = transaction()

    return NextResponse.json({
      auto_set: autoSetCount,
      pending_approval: pendingMatches.length,
      unmatched: unmatchedItems.length,
      errors,
      pending_matches: pendingMatches,
      unmatched_items: unmatchedItems,
      import_log_id: importLogId?.toString() || "",
    } as AvisImportResponse)
  } catch (e) {
    console.error("[/api/avis/import] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Import" }, { status: 500 })
  }
}

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
