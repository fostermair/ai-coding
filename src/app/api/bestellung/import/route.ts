import { NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getDb } from "@/lib/db"
import { parseBestellung } from "@/lib/parser/bestellung"

// ── Polyfill for pdfjs-dist (same as in /api/import) ──
if (typeof globalThis.DOMMatrix === "undefined") {
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>

const BESTELLUNG_DIR = path.join(process.cwd(), "data", "bestellungen")

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

    // ── Parse Bestellbestätigung ───────────────────────────────────────────
    let parsed
    try {
      parsed = parseBestellung(pdfText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Format nicht erkannt"
      logImport(file.name, "error", msg)
      return NextResponse.json({ message: msg }, { status: 422 })
    }

    const db = getDb()

    // ── Duplicate check: order_number must be unique ──────────────────────
    const existing = db
      .prepare("SELECT id FROM bestellung_items WHERE order_number = ? LIMIT 1")
      .get(parsed.orderNumber)

    if (existing) {
      const msg = `Bestellung bereits importiert (Bestellnummer: ${parsed.orderNumber})`
      logImport(file.name, "duplicate", msg)
      return NextResponse.json({ message: msg }, { status: 409 })
    }

    // ── Save PDF to disk ──────────────────────────────────────────────────
    if (!fs.existsSync(BESTELLUNG_DIR)) {
      fs.mkdirSync(BESTELLUNG_DIR, { recursive: true })
    }

    const sanitizedFilename = `bestellung_${parsed.orderNumber}_${Date.now()}.pdf`
    const filePath = path.join(BESTELLUNG_DIR, sanitizedFilename)
    fs.writeFileSync(filePath, buffer)

    // ── Insert in transaction ──────────────────────────────────────────────
    const insertLog = db.prepare(
      "INSERT INTO import_log (filename, status, message, pdf_path, order_date, order_total_cents) VALUES (?, ?, ?, ?, ?, ?)"
    )

    const insertBestellungItem = db.prepare(`
      INSERT INTO bestellung_items
        (import_log_id, order_number, article_name, quantity_amount, quantity_unit,
         unit_price_cents, total_price_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const doInsert = db.transaction(() => {
      const { lastInsertRowid: importLogId } = insertLog.run(
        file.name,
        "success",
        `${parsed.items.length} Artikel importiert`,
        filePath,
        parsed.orderDate ?? null,
        parsed.orderTotalCents ?? null
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

    const importLogId = doInsert()

    return NextResponse.json({
      id: importLogId,
      orderNumber: parsed.orderNumber,
      items: parsed.items.length,
      total: (parsed.items.reduce((sum, i) => sum + i.totalPriceCents, 0) / 100)
        .toFixed(2)
        .replace(".", ","),
    })
  } catch (e) {
    console.error("[/api/bestellung/import] Unexpected error:", e)
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
    // Non-critical
  }
}
