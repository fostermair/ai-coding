import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface MonthRow {
  monat: string
  ausgaben_cents: number
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const monate = searchParams.get("monate") // 3, 6, 12 or null (all)

    let dateFilter = ""
    const params: string[] = []

    if (monate && ["3", "6", "12"].includes(monate)) {
      dateFilter = "AND r.receipt_date >= date('now', ?)"
      params.push(`-${monate} months`)
    }

    const rows = db
      .prepare(
        `SELECT
          strftime('%Y-%m', r.receipt_date) AS monat,
          SUM(ri.total_price_cents) AS ausgaben_cents
        FROM receipts r
        JOIN receipt_items ri ON ri.receipt_id = r.id
        LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
        WHERE (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND ri.unit_price_cents > 0
          AND COALESCE(pa.excluded_from_stats, 0) = 0
          ${dateFilter}
        GROUP BY monat
        ORDER BY monat ASC`
      )
      .all(...params) as MonthRow[]

    // Calculate month-over-month comparison for the latest month
    let vergleich = null
    if (rows.length >= 2) {
      const current = rows[rows.length - 1]
      const previous = rows[rows.length - 2]
      const diff = current.ausgaben_cents - previous.ausgaben_cents
      const pct = previous.ausgaben_cents !== 0
        ? Math.round((diff / Math.abs(previous.ausgaben_cents)) * 100)
        : 0
      vergleich = {
        aktuell_monat: current.monat,
        vormonat: previous.monat,
        diff_cents: diff,
        diff_prozent: pct,
      }
    }

    return NextResponse.json({ monate: rows, vergleich })
  } catch (e) {
    console.error("[/api/statistiken/monatlich] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
