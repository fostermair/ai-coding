import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

type BonCategoryRule = { muster: string; kategorie: string }

function resolveCategory(
  effectiveName: string | null | undefined,
  override: string | null | undefined,
  rules: BonCategoryRule[]
): string {
  if (override) return override
  const lower = (effectiveName ?? "").toLowerCase()
  for (const rule of rules) {
    if (lower.includes(rule.muster.toLowerCase())) return rule.kategorie
  }
  return "Sonstiges"
}

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
          r.kategorie_override,
          ta.alias AS bank_alias,
          ta.logo_path AS bank_logo_path,
          ma.alias AS market_alias,
          ma.logo_path AS market_logo_path,
          (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) AS item_count,
          (SELECT COALESCE(SUM(ri.total_price_cents), 0) FROM receipt_items ri WHERE ri.receipt_id = r.id AND ri.item_type IN ('product', 'concession')) AS food_amount_cents,
          CASE WHEN r.bank_transaction_id IS NOT NULL THEN 1 ELSE 0 END AS has_bank_match,
          bt.match_source AS bank_match_source,
          CASE
            WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id) = 0
              THEN NULL
            WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status = 'pending') > 0
              THEN 'pending'
            WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status IN ('confirmed', 'auto_set')) > 0
              AND (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status NOT IN ('confirmed', 'auto_set', 'rejected')) = 0
              THEN 'complete'
            ELSE 'no_matches'
          END AS avis_status,
          CASE WHEN r.store_chain = 'rewe' AND r.is_virtual = 0 AND EXISTS (
            SELECT 1
            FROM import_log il
            WHERE il.source_type = 'bestellung'
              AND (
                (il.order_date IS NOT NULL AND (
                  ABS(JULIANDAY(r.receipt_date) - JULIANDAY(il.order_date)) = 0
                  OR (
                    ABS(JULIANDAY(r.receipt_date) - JULIANDAY(il.order_date)) BETWEEN 1 AND 2
                    AND (il.order_total_cents IS NULL OR ABS(il.order_total_cents - r.total_amount_cents) <= 1500)
                  )
                ))
                OR (
                  il.order_date IS NULL
                  AND ABS((SELECT SUM(bi.total_price_cents) FROM bestellung_items bi WHERE bi.import_log_id = il.id) - r.total_amount_cents) <= 500
                )
              )
          ) THEN 1 ELSE 0 END AS has_bestellung
        FROM receipts r
        LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
        LEFT JOIN transaction_aliases ta ON ta.beschreibung = bt.beschreibung
        LEFT JOIN market_aliases ma ON ma.store_name = r.store_name
        ${where}
        ORDER BY r.receipt_date DESC, r.receipt_time DESC`
      )
      .all(...params)

    // Resolve category for each bon using rules (longest match wins) + override
    const categoryRules = db
      .prepare(
        "SELECT muster, kategorie FROM bon_categories ORDER BY LENGTH(muster) DESC"
      )
      .all() as BonCategoryRule[]

    for (const bon of bons as Record<string, unknown>[]) {
      const effectiveName =
        (bon.market_alias as string | null) ??
        (bon.bank_alias as string | null) ??
        (bon.store_name as string | null)
      bon.kategorie = resolveCategory(
        effectiveName,
        bon.kategorie_override as string | null,
        categoryRules
      )
    }

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
