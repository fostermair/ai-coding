import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import type Database from "better-sqlite3"

interface InflationsIndexResponse {
  personal_rate: number | null
  official_rate: number | null
  delta: number | null
  basis_products_count: number
  period_von: number
  period_bis: number
  warning: string | null
  sparkline: { period: string; personal_rate: number | null }[]
  available_periods: { von: number; bis: number }[]
}

interface LaspeyresRow {
  raw_name: string
  basis_quantity: number
  basis_price: number
  current_price: number
}

function computeLaspeyres(
  db: Database.Database,
  von: number,
  bis: number,
  kategorie: string | null
): { rate: number | null; count: number } {
  const kategoriClause = kategorie
    ? `AND COALESCE(pc.category, 'Sonstiges') = ?`
    : ""

  // Param order matches SQL: IN(von, bis), [kategorie?], base.jahr=von, curr.jahr=bis
  const params: (string | number)[] = [String(von), String(bis)]
  if (kategorie) params.push(kategorie)
  params.push(String(von), String(bis))

  const rows = db
    .prepare(
      `WITH period_items AS (
        SELECT
          ri.raw_name,
          strftime('%Y', r.receipt_date) AS jahr,
          SUM(ri.quantity) AS total_quantity,
          AVG(ri.unit_price_cents) AS avg_price_cents
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
        LEFT JOIN product_categories pc ON pc.alias = ri.raw_name
        WHERE ri.unit_price_cents > 0
          AND (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND COALESCE(pa.excluded_from_stats, 0) = 0
          AND strftime('%Y', r.receipt_date) IN (?, ?)
          ${kategoriClause}
        GROUP BY ri.raw_name, strftime('%Y', r.receipt_date)
      ),
      base AS (
        SELECT raw_name, total_quantity, avg_price_cents
        FROM period_items WHERE jahr = ?
      ),
      curr AS (
        SELECT raw_name, avg_price_cents
        FROM period_items WHERE jahr = ?
      )
      SELECT
        b.raw_name,
        b.total_quantity AS basis_quantity,
        b.avg_price_cents AS basis_price,
        c.avg_price_cents AS current_price
      FROM base b
      INNER JOIN curr c ON c.raw_name = b.raw_name
      WHERE b.avg_price_cents > 0 AND c.avg_price_cents > 0`
    )
    .all(...params) as LaspeyresRow[]

  if (rows.length === 0) return { rate: null, count: 0 }

  // Laspeyres: Σ(q_base * p_curr) / Σ(q_base * p_base) - 1
  let numerator = 0
  let denominator = 0
  for (const row of rows) {
    numerator += row.basis_quantity * row.current_price
    denominator += row.basis_quantity * row.basis_price
  }

  const rate = denominator > 0 ? Math.round((numerator / denominator - 1) * 1000) / 10 : null

  return { rate, count: rows.length }
}

export async function GET(request: Request): Promise<NextResponse<InflationsIndexResponse>> {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const kategorie = searchParams.get("kategorie") || null

    const availableYears = (
      db
        .prepare(
          `SELECT DISTINCT CAST(strftime('%Y', receipt_date) AS INTEGER) AS year
           FROM receipts WHERE receipt_date IS NOT NULL ORDER BY year`
        )
        .all() as { year: number }[]
    ).map((r) => r.year)

    if (availableYears.length < 2) {
      return NextResponse.json({
        personal_rate: null,
        official_rate: null,
        delta: null,
        basis_products_count: 0,
        period_von: 0,
        period_bis: 0,
        warning:
          "Importiere Bons aus mindestens zwei verschiedenen Jahren für diesen Vergleich.",
        sparkline: [],
        available_periods: [],
      })
    }

    // Build all consecutive year pairs
    const allPairs: { von: number; bis: number }[] = []
    for (let i = 1; i < availableYears.length; i++) {
      if (availableYears[i] === availableYears[i - 1] + 1) {
        allPairs.push({ von: availableYears[i - 1], bis: availableYears[i] })
      }
    }

    const defaultPair = allPairs[allPairs.length - 1] ?? {
      von: availableYears[availableYears.length - 2],
      bis: availableYears[availableYears.length - 1],
    }

    const von = parseInt(searchParams.get("von") || String(defaultPair.von), 10)
    const bis = parseInt(searchParams.get("bis") || String(defaultPair.bis), 10)

    const result = computeLaspeyres(db, von, bis, kategorie)

    const baseMonths = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT strftime('%Y-%m', receipt_date)) AS n
           FROM receipts WHERE strftime('%Y', receipt_date) = ?`
        )
        .get(String(von)) as { n: number }
    ).n

    const currMonths = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT strftime('%Y-%m', receipt_date)) AS n
           FROM receipts WHERE strftime('%Y', receipt_date) = ?`
        )
        .get(String(bis)) as { n: number }
    ).n

    let warning: string | null = null
    if (result.count === 0) {
      warning = "Keine gemeinsamen Produkte in beiden Perioden gefunden."
    } else if (baseMonths < 6 || currMonths < 6) {
      warning = "Datenbasis zu klein für verlässliche Aussage (weniger als 6 Monate Daten in einer Periode)."
    }

    const offRow = db
      .prepare(
        `SELECT official_rate_percent FROM inflation_reference_values WHERE year = ?`
      )
      .get(bis) as { official_rate_percent: number | null } | null
    const official_rate = offRow?.official_rate_percent ?? null

    const delta =
      result.rate !== null && official_rate !== null
        ? Math.round((result.rate - official_rate) * 10) / 10
        : null

    // Sparkline: last 3 consecutive pairs (excluding current selection)
    const sparklinePairs = allPairs.slice(-3)
    const sparkline = sparklinePairs.map(({ von: v, bis: b }) => {
      const r = computeLaspeyres(db, v, b, kategorie)
      return { period: `${v}→${b}`, personal_rate: r.rate }
    })

    return NextResponse.json({
      personal_rate: result.rate,
      official_rate,
      delta,
      basis_products_count: result.count,
      period_von: von,
      period_bis: bis,
      warning,
      sparkline,
      available_periods: allPairs,
    })
  } catch (e) {
    console.error("[/api/statistiken/inflations-index] Error:", e)
    return NextResponse.json(
      {
        personal_rate: null,
        official_rate: null,
        delta: null,
        basis_products_count: 0,
        period_von: 0,
        period_bis: 0,
        warning: null,
        sparkline: [],
        available_periods: [],
      },
      { status: 500 }
    )
  }
}
