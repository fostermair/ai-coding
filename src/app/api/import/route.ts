import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseReweEbon, formatGermanDate } from "@/lib/parser/rewe"
// pdf-parse has no proper ESM export – require() works in Node.js API routes
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: "Keine PDF-Datei erhalten" }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { message: "Nur PDF-Dateien werden akzeptiert" },
        { status: 400 }
      )
    }

    // ── Extract text from PDF ──────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer())
    let pdfText: string
    try {
      const data = await pdfParse(buffer)
      pdfText = data.text
    } catch {
      return NextResponse.json(
        { message: "PDF konnte nicht gelesen werden" },
        { status: 422 }
      )
    }

    if (!pdfText || pdfText.trim().length < 50) {
      return NextResponse.json(
        { message: "PDF enthält keinen lesbaren Text" },
        { status: 422 }
      )
    }

    // ── Parse REWE eBon ────────────────────────────────────────────────────
    let parsed
    try {
      parsed = parseReweEbon(pdfText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Format nicht erkannt"
      logImport(file.name, "error", msg)
      return NextResponse.json({ message: msg }, { status: 422 })
    }

    const db = getDb()

    // ── Duplicate check ────────────────────────────────────────────────────
    const existing = db
      .prepare(
        "SELECT id FROM receipts WHERE receipt_nr = ? AND market_nr = ? AND receipt_date = ?"
      )
      .get(parsed.receiptNr, parsed.marketNr, parsed.receiptDate)

    if (existing) {
      const msg = `Bon bereits importiert (Bon-Nr. ${parsed.receiptNr}, Datum ${formatGermanDate(parsed.receiptDate)})`
      logImport(file.name, "duplicate", msg)
      return NextResponse.json({ message: msg }, { status: 409 })
    }

    // ── Insert in transaction ──────────────────────────────────────────────
    const insertReceipt = db.prepare(`
      INSERT INTO receipts
        (filename, store_name, store_address, store_uid, market_nr, receipt_nr,
         receipt_date, receipt_time, payment_method, total_amount_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        file.name,
        parsed.storeName,
        parsed.storeAddress,
        parsed.storeUid,
        parsed.marketNr,
        parsed.receiptNr,
        parsed.receiptDate,
        parsed.receiptTime,
        parsed.paymentMethod,
        parsed.totalAmountCents
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

      insertLog.run(file.name, "success", `${parsed.items.length} Positionen importiert`)
      return receiptId
    })

    const receiptId = doInsert()

    return NextResponse.json({
      id: receiptId,
      date: formatGermanDate(parsed.receiptDate),
      store: parsed.storeName,
      items: parsed.items.length,
      total: (parsed.totalAmountCents / 100).toFixed(2).replace(".", ","),
    })
  } catch (e) {
    console.error("[/api/import] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Import" }, { status: 500 })
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
