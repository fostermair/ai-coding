import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface ProductRow {
  raw_name: string
  alias: string | null
  kaufhaeufigkeit: number
  gesamt_cents: number
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const monate = searchParams.get("monate")
    const sort = searchParams.get("sort") ?? "frequency" // "frequency" or "spending"

    let dateFilter = ""
    const params: string[] = []

    if (monate && ["3", "6", "12"].includes(monate)) {
      dateFilter = "AND r.receipt_date >= date('now', ?)"
      params.push(`-${monate} months`)
    }

    const orderBy = sort === "spending"
      ? "gesamt_cents DESC"
      : "kaufhaeufigkeit DESC"

    const rows = db
      .prepare(
        `SELECT
          ri.raw_name,
          NULLIF(pa.alias, '') AS alias,
          COUNT(*) AS kaufhaeufigkeit,
          SUM(ri.total_price_cents) AS gesamt_cents
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
        WHERE ri.unit_price_cents > 0
          AND (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND COALESCE(pa.excluded_from_stats, 0) = 0
          ${dateFilter}
        GROUP BY ri.raw_name
        ORDER BY ${orderBy}
        LIMIT 10`
      )
      .all(...params) as ProductRow[]

    return NextResponse.json({ produkte: rows })
  } catch (e) {
    console.error("[/api/statistiken/top-produkte] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
