import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseAvis } from "@/lib/parser/avis"
import { calculateMatchConfidence } from "@/lib/avis-matching"
import { categorize } from "@/lib/categorization/engine"

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
  ebonItemId: number
  ebonReceiptId: number
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
      const db = getDb()
      db.prepare("INSERT INTO import_log (filename, status, message, source_type) VALUES (?, ?, ?, ?)")
        .run(`[AVIS-Fehler] ${file.name}`, "error", msg, "avis")
      return NextResponse.json({ message: msg }, { status: 422 })
    }

    const db = getDb()

    // Duplicate check: check if AVIS with same order number was already imported
    const existingImport = db
      .prepare("SELECT id FROM import_log WHERE filename LIKE ? AND status = 'success'")
      .get(`%[AVIS] ${parsed.orderNumber}%`) as { id: number } | undefined

    // Check if user wants to force re-import
    const urlParams = new URL(request.url || "http://localhost").searchParams
    const forceReImport = urlParams.get("forceReImport") === "true"

    if (existingImport && !forceReImport) {
      // Return 409 with isDuplicate flag - let frontend ask user
      return NextResponse.json(
        {
          isDuplicate: true,
          message: `AVIS mit Bestellnummer ${parsed.orderNumber} wurde bereits importiert. Erneut importieren?`,
          orderNumber: parsed.orderNumber,
        },
        { status: 409 }
      )
    }

    // Fetch all eBon items from DB to match against
    interface EbonItem {
      id: number
      receipt_id: number
      raw_name: string
      quantity: number
      unit_price_cents: number
      date: string
    }
    const ebonItems = db
      .prepare(
        `SELECT id, receipt_id, raw_name, quantity, unit_price_cents,
                (SELECT receipt_date FROM receipts WHERE receipts.id = receipt_items.receipt_id) as date
         FROM receipt_items
         WHERE item_type = 'product'
         ORDER BY date DESC`
      )
      .all() as EbonItem[]

    // Verify a receipt exists for this AVIS date before doing any work
    interface ReceiptInfo {
      id: number
    }
    const receipt = db
      .prepare("SELECT id FROM receipts WHERE receipt_date = ? LIMIT 1")
      .get(parsed.pickupDate) as ReceiptInfo | undefined

    if (!receipt) {
      const msg = `Kein Bon für AVIS-Datum ${parsed.pickupDate} gefunden`
      db.prepare("INSERT INTO import_log (filename, status, message, source_type) VALUES (?, ?, ?, ?)")
        .run(`[AVIS] ${parsed.orderNumber}`, "error", msg, "avis")
      return NextResponse.json({ message: msg }, { status: 422 })
    }

    // Match AVIS items with eBon items
    const autoSet: MatchResult[] = []
    const pendingMatches: MatchResult[] = []
    const unmatchedItems: Array<{ name: string; price: number; date: string }> = []
    let errors = 0

    // Filter eBon items to realistic time window (±14 days from AVIS)
    const avisDateObj = new Date(parsed.pickupDate)
    const ebonItemsInWindow = ebonItems.filter((item) => {
      const ebonDateObj = new Date(item.date)
      const dayDiff = Math.abs((avisDateObj.getTime() - ebonDateObj.getTime()) / (1000 * 60 * 60 * 24))
      return dayDiff <= 14
    })

    // Track which eBon items have already been claimed by a previous AVIS item.
    // Prevents two AVIS items with identical price/date/qty from both matching the
    // same receipt item (e.g. two YouCook dishes at the same price both scoring 100
    // against the first one encountered).
    const claimedEbonItemIds = new Set<number>()

    for (const avisItem of parsed.items) {
      // "unavailable" items were not delivered — store as unmatched for reference.
      // "substitute" items were delivered as replacements and should be matched normally.
      if (avisItem.status === "unavailable") {
        unmatchedItems.push({
          name: avisItem.name,
          price: avisItem.unitPrice,
          date: parsed.pickupDate,
        })
        continue
      }

      // Find best match among eBon items in the window that haven't been claimed yet
      let bestMatch: (typeof ebonItems)[0] | null = null
      let bestConfidence = 0

      for (const ebonItem of ebonItemsInWindow) {
        if (claimedEbonItemIds.has(ebonItem.id)) continue

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

      if (!bestMatch) {
        // No match found - will save as unmatched
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
        ebonItemId: bestMatch.id,
        ebonReceiptId: bestMatch.receipt_id,
      }

      // Claim this eBon item so no later AVIS item can also match it
      claimedEbonItemIds.add(bestMatch.id)

      // Only auto-set with very high confidence AND good name match
      // Requires: excellent name match (>75%) + good date/price/qty combo
      if (bestConfidence >= 85) {
        autoSet.push(match)
      } else if (bestConfidence >= 60) {
        pendingMatches.push(match)
      } else {
        // Low confidence match (55-59%) - save as unmatched for manual review
        unmatchedItems.push({
          name: avisItem.name,
          price: avisItem.unitPrice,
          date: parsed.pickupDate,
        })
      }
    }

    // Auto-set aliases for high-confidence matches
    let autoSetCount = 0
    const setAliasStmt = db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET alias = excluded.alias, updated_at = datetime('now')
       WHERE product_aliases.alias = ''`
    )
    const insertMatchStmt = db.prepare(
      `INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const transaction = db.transaction(() => {
      // Log import first to get the import_log_id
      const logStmt = db.prepare(
        "INSERT INTO import_log (filename, status, message, source_type, order_date) VALUES (?, ?, ?, ?, ?)"
      )
      const logResult = logStmt.run(
        `[AVIS] ${parsed.orderNumber}`,
        "success",
        `${autoSet.length} Aliases automatisch gesetzt, ${pendingMatches.length} zu Überprüfung, ${unmatchedItems.length} nicht gematcht`,
        "avis",
        parsed.pickupDate
      )
      const logId = logResult.lastInsertRowid as number

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

        // Insert match record — use the receipt_id of the matched eBon item, not the
        // first receipt found on the AVIS date, so items are attributed to the correct Bon
        // when multiple receipts share the same date.
        insertMatchStmt.run(
          match.ebonReceiptId,
          match.ebonItemId,
          logId,
          match.avisName,
          match.avisPrice,
          match.confidence,
          "auto_set"
        )
      }

      // Process pending matches
      for (const match of pendingMatches) {
        insertMatchStmt.run(
          match.ebonReceiptId,
          match.ebonItemId,
          logId,
          match.avisName,
          match.avisPrice,
          match.confidence,
          "pending"
        )
      }

      // Process unmatched items - save them with status='unmatched' and receipt_item_id=NULL
      // These are available for manual assignment later
      for (const unmatchedItem of unmatchedItems) {
        // Find an unmatched AVIS item that wasn't matched to an eBon item
        const parseItemPrice = Math.round(unmatchedItem.price * 100) / 100
        insertMatchStmt.run(
          receipt.id,
          null, // No receipt_item_id for unmatched items
          logId,
          unmatchedItem.name,
          Math.round(unmatchedItem.price * 100), // price in cents
          0, // confidence is 0 for unmatched
          "unmatched"
        )
      }

      return logId
    })

    const importLogId = transaction()

    // Auto-categorize products that received new aliases from this AVIS import
    try {
      const db2 = getDb()
      const upsertCat = db2.prepare(
        `INSERT INTO product_categories (alias, category, source, updated_at)
         VALUES (?, ?, 'auto', datetime('now'))
         ON CONFLICT(alias) DO UPDATE SET
           category = excluded.category,
           updated_at = excluded.updated_at
         WHERE source = 'auto'`
      )
      for (const match of autoSet) {
        const aliasRow = db2
          .prepare("SELECT alias FROM product_aliases WHERE raw_name = ?")
          .get(match.ebonRawName) as { alias: string } | undefined
        const category = categorize(match.ebonRawName, aliasRow?.alias || match.avisName)
        upsertCat.run(match.ebonRawName, category)
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      auto_set: autoSet.length,
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

