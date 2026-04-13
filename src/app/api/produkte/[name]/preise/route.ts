import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface PriceRow {
  datum: string
  zeit: string
  einzelpreis_cents: number
  rabatt_cents: number | null
  bon_nr: string
  markt: string
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)
    const db = getDb()

    const rows = db
      .prepare(
        `SELECT
          r.receipt_date AS datum,
          r.receipt_time AS zeit,
          ri.unit_price_cents AS einzelpreis_cents,
          (SELECT SUM(id2.amount_cents) FROM item_discounts id2 WHERE id2.receipt_item_id = ri.id) AS rabatt_cents,
          r.receipt_nr AS bon_nr,
          r.store_name AS markt
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE ri.raw_name = ?
          AND (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND ri.unit_price_cents > 0
        ORDER BY r.receipt_date ASC, r.receipt_time ASC`
      )
      .all(rawName) as PriceRow[]

    // Get alias if exists
    const aliasRow = db
      .prepare(`SELECT alias FROM product_aliases WHERE raw_name = ?`)
      .get(rawName) as { alias: string } | undefined

    return NextResponse.json({
      raw_name: rawName,
      alias: aliasRow?.alias ?? null,
      preise: rows.map((row) => ({
        datum: row.datum,
        zeit: row.zeit,
        einzelpreis_cents: row.einzelpreis_cents,
        rabatt_cents: row.rabatt_cents ?? 0,
        bon_nr: row.bon_nr,
        markt: row.markt,
      })),
    })
  } catch (e) {
    console.error("[/api/produkte/[name]/preise] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
