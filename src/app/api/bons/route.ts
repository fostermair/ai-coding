import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from") // YYYY-MM-DD
    const to = searchParams.get("to") // YYYY-MM-DD

    // Validate date format if provided
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if (from && !dateRe.test(from)) {
      return NextResponse.json({ message: "Ungültiges Datum (from)" }, { status: 400 })
    }
    if (to && !dateRe.test(to)) {
      return NextResponse.json({ message: "Ungültiges Datum (to)" }, { status: 400 })
    }

    // Build query with optional date filters
    let where = ""
    const params: string[] = []

    if (from) {
      where += " WHERE r.receipt_date >= ?"
      params.push(from)
    }
    if (to) {
      where += (where ? " AND" : " WHERE") + " r.receipt_date <= ?"
      params.push(to)
    }

    // Fetch bons with item count and AVIS status
    const bons = db
      .prepare(
        `SELECT
          r.id,
          r.receipt_date,
          r.receipt_time,
          r.store_name,
          r.receipt_nr,
          r.market_nr,
          r.total_amount_cents,
          r.payment_method,
          r.store_chain,
          r.is_virtual,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) AS item_count,
          CASE
            WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id) = 0
              THEN NULL
            WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status = 'pending') > 0
              THEN 'pending'
            WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status IN ('confirmed', 'auto_set')) > 0
              AND (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status NOT IN ('confirmed', 'auto_set', 'rejected')) = 0
              THEN 'complete'
            ELSE 'no_matches'
          END AS avis_status
        FROM receipts r
        ${where}
        ORDER BY r.receipt_date DESC, r.receipt_time DESC`
      )
      .all(...params)

    // Total stats (unfiltered) — real bons only for count; all receipts (incl. virtual) for total spend
    const stats = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM receipts WHERE is_virtual = 0) AS total_count,
          COALESCE(SUM(total_amount_cents), 0) AS total_spent_cents
         FROM receipts`
      )
      .get() as { total_count: number; total_spent_cents: number }

    return NextResponse.json({
      bons,
      total_count: stats.total_count,
      total_spent_cents: stats.total_spent_cents,
    })
  } catch (e) {
    console.error("[/api/bons] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
