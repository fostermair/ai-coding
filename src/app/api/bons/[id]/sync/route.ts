import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseReweEbon } from "@/lib/parser/rewe"

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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const bonId = parseInt(id, 10)
    if (isNaN(bonId)) {
      return NextResponse.json({ message: "Ungültige Bon-ID" }, { status: 400 })
    }

    const baseUrl = process.env.PAPERLESS_URL
    const token = process.env.PAPERLESS_TOKEN

    if (!baseUrl || !token) {
      return NextResponse.json(
        { message: "PAPERLESS_URL und PAPERLESS_TOKEN nicht konfiguriert" },
        { status: 503 }
      )
    }

    const db = getDb()

    const receipt = db
      .prepare("SELECT id, paperless_doc_id, filename FROM receipts WHERE id = ?")
      .get(bonId) as { id: number; paperless_doc_id: number | null; filename: string } | undefined

    if (!receipt) {
      return NextResponse.json({ message: "Bon nicht gefunden" }, { status: 404 })
    }

    if (!receipt.paperless_doc_id) {
      return NextResponse.json(
        { message: "Dieser Bon wurde nicht über Paperless importiert und kann nicht neu synchronisiert werden." },
        { status: 422 }
      )
    }

    // ── Download PDF from Paperless ────────────────────────────────────────
    let pdfBuffer: Buffer
    try {
      const pdfRes = await fetch(
        `${baseUrl}/api/documents/${receipt.paperless_doc_id}/download/`,
        { headers: { Authorization: `Token ${token}` } }
      )
      if (!pdfRes.ok) {
        return NextResponse.json(
          { message: `PDF-Download fehlgeschlagen (${pdfRes.status})` },
          { status: 502 }
        )
      }
      pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
    } catch {
      return NextResponse.json(
        { message: "Paperless-ngx nicht erreichbar" },
        { status: 503 }
      )
    }

    // ── Extract text ───────────────────────────────────────────────────────
    let pdfText: string
    try {
      const data = await pdfParse(pdfBuffer)
      pdfText = data.text
    } catch {
      return NextResponse.json({ message: "PDF konnte nicht gelesen werden" }, { status: 422 })
    }

    // ── Parse ──────────────────────────────────────────────────────────────
    let parsed
    try {
      parsed = parseReweEbon(pdfText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Format nicht erkannt"
      return NextResponse.json({ message: msg }, { status: 422 })
    }

    // ── Replace items in transaction ───────────────────────────────────────
    db.transaction(() => {
      db.prepare("DELETE FROM avis_matches WHERE receipt_id = ?").run(bonId)
      db.prepare("DELETE FROM receipt_items WHERE receipt_id = ?").run(bonId)

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
          bonId,
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

      db.prepare(
        "UPDATE receipts SET needs_reparse = 0, store_name = ?, store_address = ?, store_uid = ?, total_amount_cents = ?, payment_method = ? WHERE id = ?"
      ).run(
        parsed.storeName,
        parsed.storeAddress,
        parsed.storeUid,
        parsed.totalAmountCents,
        parsed.paymentMethod,
        bonId
      )

      db.prepare(
        "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
      ).run(
        receipt.filename,
        "reparsed",
        `${parsed.items.length} Positionen neu eingelesen`
      )
    })()

    return NextResponse.json({
      message: `${parsed.items.length} Positionen neu eingelesen`,
      items: parsed.items.length,
    })
  } catch (e) {
    console.error("[/api/bons/[id]/sync] POST Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
