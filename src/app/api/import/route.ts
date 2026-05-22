import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseReweEbon, formatGermanDate } from "@/lib/parser/rewe"
import { rematchAfterBonImport } from "@/lib/konto-matching"

// ── pdfjs-dist (used internally by pdf-parse) requires browser globals that
//    don't exist in Node.js. Polyfill them before require() is called. ──────

if (typeof globalThis.DOMMatrix === "undefined") {
  // Minimal DOMMatrix polyfill – pdfjs needs it for coordinate transforms.
  class DOMMatrixMinimal {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // @ts-expect-error – polyfill for Node.js environment
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

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: "PDF-Datei ist zu groß (max. 10 MB)" },
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
         receipt_date, receipt_time, payment_method, total_amount_cents, store_chain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        parsed.totalAmountCents,
        parsed.storeChain
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

    // Re-match open Kontoauszug transactions against the new bon
    try {
      const db2 = getDb()
      rematchAfterBonImport(
        db2,
        receiptId as number,
        parsed.receiptDate,
        parsed.totalAmountCents,
        "rewe"
      )
    } catch {
      // Non-critical
    }

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
