import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import { getDb } from "@/lib/db"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const bonId = parseInt(id, 10)
    if (isNaN(bonId)) {
      return NextResponse.json({ message: "Ungültige Bon-ID" }, { status: 400 })
    }

    const db = getDb()

    // Find matching bestellung via receipt total amount
    const receiptRow = db
      .prepare(`SELECT total_amount_cents FROM receipts WHERE id = ?`)
      .get(bonId) as { total_amount_cents: number } | undefined

    if (!receiptRow) {
      return NextResponse.json({ message: "Bon nicht gefunden" }, { status: 404 })
    }

    const orderMatch = db
      .prepare(
        `SELECT order_number
         FROM (
           SELECT order_number, SUM(total_price_cents) AS order_total
           FROM bestellung_items
           GROUP BY order_number
         )
         WHERE ABS(order_total - ?) <= 100
         LIMIT 1`
      )
      .get(receiptRow.total_amount_cents) as { order_number: string | null } | undefined

    if (!orderMatch?.order_number) {
      return NextResponse.json(
        { message: "Kein Bestellartikel für diesen Bon gefunden" },
        { status: 404 }
      )
    }

    // Find bestellung_items for this order number and get the PDF path
    const bestellungData = db
      .prepare(
        `SELECT DISTINCT il.pdf_path
         FROM bestellung_items bi
         INNER JOIN import_log il ON bi.import_log_id = il.id
         WHERE bi.order_number = ?
         LIMIT 1`
      )
      .get(orderMatch.order_number) as { pdf_path: string | null } | undefined

    if (!bestellungData?.pdf_path) {
      return NextResponse.json(
        { message: "Bestellbestätigung nicht vorhanden" },
        { status: 404 }
      )
    }

    // Read and stream the PDF file
    if (!fs.existsSync(bestellungData.pdf_path)) {
      return NextResponse.json(
        { message: "Bestellbestätigung-Datei nicht gefunden" },
        { status: 404 }
      )
    }

    try {
      const pdfBuffer = fs.readFileSync(bestellungData.pdf_path)

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      })
    } catch {
      return NextResponse.json(
        { message: "PDF konnte nicht gelesen werden" },
        { status: 500 }
      )
    }
  } catch (e) {
    console.error("[/api/bons/[id]/bestellung-pdf] GET Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
