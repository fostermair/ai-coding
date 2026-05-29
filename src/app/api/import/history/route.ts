import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")

  if (!type || !["ebon", "avis", "bestellung", "kontoauszug"].includes(type)) {
    return NextResponse.json({ message: "Ungültiger type-Parameter" }, { status: 400 })
  }

  try {
    const db = getDb()

    if (type === "ebon") {
      // Use receipts as base — each receipt = one eBon. import_log deduplicated per filename.
      const rows = db.prepare(`
        SELECT
          r.id,
          r.filename,
          (SELECT MIN(il.imported_at) FROM import_log il WHERE il.filename = r.filename) AS imported_at,
          r.store_name,
          r.store_chain,
          r.receipt_date,
          r.total_amount_cents,
          CASE WHEN r.bank_transaction_id IS NOT NULL THEN 1 ELSE 0 END AS has_bank_match
        FROM receipts r
        WHERE r.is_virtual = 0
        ORDER BY r.receipt_date DESC
      `).all() as Array<{
        id: number
        filename: string
        imported_at: string | null
        store_name: string | null
        store_chain: string | null
        receipt_date: string | null
        total_amount_cents: number | null
        has_bank_match: number
      }>

      return NextResponse.json(rows.map((r) => ({ ...r, has_bank_match: r.has_bank_match === 1 })))
    }

    if (type === "avis") {
      const rows = db.prepare(`
        SELECT
          il.id,
          il.filename,
          il.imported_at,
          il.status,
          il.message,
          il.order_date AS avis_pickup_date,
          r.receipt_date AS matched_receipt_date,
          r.total_amount_cents AS matched_receipt_total_cents,
          CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS has_match
        FROM import_log il
        LEFT JOIN (
          SELECT import_log_id, MIN(receipt_id) AS receipt_id
          FROM avis_matches
          GROUP BY import_log_id
        ) am ON am.import_log_id = il.id
        LEFT JOIN receipts r ON r.id = am.receipt_id
        WHERE il.source_type = 'avis'
        ORDER BY il.imported_at DESC
      `).all() as Array<{
        id: number
        filename: string
        imported_at: string
        status: string
        message: string | null
        avis_pickup_date: string | null
        matched_receipt_date: string | null
        matched_receipt_total_cents: number | null
        has_match: number
      }>

      return NextResponse.json(rows.map((r) => ({ ...r, has_match: r.has_match === 1, message: r.message ?? null })))
    }

    if (type === "bestellung") {
      // NOTE: SQLite scalar subqueries (used as SELECT values) do not allow
      // ORDER BY to reference outer-query columns — only WHERE does. So we use
      // MIN(receipt_date) / MIN(total_amount_cents) as a deterministic tie-breaker
      // within the already-filtered candidate set (date±2d + amount±1500ct).
      const rows = db.prepare(`
        SELECT
          il.id,
          il.filename,
          il.imported_at,
          il.order_date,
          il.order_total_cents,
          COALESCE(il.order_number, (SELECT MIN(bi.order_number) FROM bestellung_items bi WHERE bi.import_log_id = il.id)) AS order_number,
          (
            SELECT MIN(r2.receipt_date) FROM receipts r2
            WHERE r2.store_chain = 'rewe' AND r2.is_virtual = 0
              AND (
                (il.order_date IS NOT NULL AND (
                  ABS(JULIANDAY(r2.receipt_date) - JULIANDAY(il.order_date)) = 0
                  OR (
                    ABS(JULIANDAY(r2.receipt_date) - JULIANDAY(il.order_date)) BETWEEN 1 AND 2
                    AND (il.order_total_cents IS NULL OR ABS(il.order_total_cents - r2.total_amount_cents) <= 1500)
                  )
                ))
                OR (
                  il.order_date IS NULL
                  AND ABS((SELECT SUM(bi2.total_price_cents) FROM bestellung_items bi2 WHERE bi2.import_log_id = il.id) - r2.total_amount_cents) <= 500
                )
              )
          ) AS matched_receipt_date,
          (
            SELECT r3.total_amount_cents FROM receipts r3
            WHERE r3.store_chain = 'rewe' AND r3.is_virtual = 0
              AND (
                (il.order_date IS NOT NULL AND (
                  ABS(JULIANDAY(r3.receipt_date) - JULIANDAY(il.order_date)) = 0
                  OR (
                    ABS(JULIANDAY(r3.receipt_date) - JULIANDAY(il.order_date)) BETWEEN 1 AND 2
                    AND (il.order_total_cents IS NULL OR ABS(il.order_total_cents - r3.total_amount_cents) <= 1500)
                  )
                ))
                OR (
                  il.order_date IS NULL
                  AND ABS((SELECT SUM(bi3.total_price_cents) FROM bestellung_items bi3 WHERE bi3.import_log_id = il.id) - r3.total_amount_cents) <= 500
                )
              )
            LIMIT 1
          ) AS matched_receipt_total_cents
        FROM import_log il
        WHERE il.source_type = 'bestellung'
        ORDER BY il.imported_at DESC
      `).all() as Array<{
        id: number
        filename: string
        imported_at: string
        order_date: string | null
        order_total_cents: number | null
        order_number: string | null
        matched_receipt_date: string | null
        matched_receipt_total_cents: number | null
      }>

      return NextResponse.json(rows.map((r) => ({
        ...r,
        has_match: r.matched_receipt_date !== null,
      })))
    }

    // kontoauszug
    const rows = db.prepare(`
      SELECT
        id,
        dateiname AS filename,
        importiert_am AS imported_at,
        konto_iban,
        periode,
        transaktion_count AS transaction_count
      FROM bank_statement_log
      ORDER BY importiert_am DESC
    `).all() as Array<{
      id: number
      filename: string | null
      imported_at: string
      konto_iban: string
      periode: string
      transaction_count: number | null
    }>

    return NextResponse.json(rows)
  } catch (e) {
    console.error("[/api/import/history] error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
