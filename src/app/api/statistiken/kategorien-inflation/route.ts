import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface KategorienInflationItem {
  category: string
  inflation_pct: number | null
  product_count: number
  avg_current_price_cents: number | null
  avg_prev_price_cents: number | null
}

interface KategorienInflationResponse {
  items: KategorienInflationItem[]
  include_excluded: boolean
}

const DEFAULT_EXCLUDED_CATEGORIES = ["Pfand", "Tabak", "Drogerie"]

export async function GET(request: Request): Promise<NextResponse<KategorienInflationResponse>> {
  try {
    const { searchParams } = new URL(request.url)
    const includeExcluded = searchParams.get("include_excluded") === "true"

    const db = getDb()

    const excludeClause = !includeExcluded
      ? `AND COALESCE(pc.category, 'Sonstiges') NOT IN (${DEFAULT_EXCLUDED_CATEGORIES.map(() => "?").join(", ")})`
      : ""

    const params = !includeExcluded ? DEFAULT_EXCLUDED_CATEGORIES : []

    const rows = db
      .prepare(
        `WITH yearly_avg AS (
          SELECT
            COALESCE(pc.category, 'Sonstiges') AS category,
            strftime('%Y', r.receipt_date) AS jahr,
            AVG(ri.unit_price_cents) AS avg_cents,
            COUNT(DISTINCT COALESCE(pa.alias, ri.raw_name)) AS product_count
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri.receipt_id
          LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
          LEFT JOIN product_categories pc ON pc.alias = pa.alias
          WHERE ri.unit_price_cents > 0
            AND (ri.item_type = 'product' OR ri.item_type = 'concession')
            AND COALESCE(pa.excluded_from_stats, 0) = 0
            ${excludeClause}
            AND strftime('%Y', r.receipt_date) IN (
              strftime('%Y', 'now'),
              strftime('%Y', 'now', '-1 year')
            )
          GROUP BY category, jahr
        ),
        yoy AS (
          SELECT
            curr.category,
            CASE
              WHEN prev.avg_cents IS NOT NULL AND prev.avg_cents > 0
              THEN ROUND((curr.avg_cents - prev.avg_cents) / prev.avg_cents * 100, 1)
              ELSE NULL
            END AS inflation_pct,
            curr.product_count,
            ROUND(curr.avg_cents) AS avg_current_price_cents,
            ROUND(prev.avg_cents) AS avg_prev_price_cents
          FROM yearly_avg curr
          LEFT JOIN yearly_avg prev
            ON prev.category = curr.category
            AND prev.jahr = strftime('%Y', 'now', '-1 year')
          WHERE curr.jahr = strftime('%Y', 'now')
        )
        SELECT * FROM yoy
        ORDER BY
          CASE WHEN inflation_pct IS NULL THEN 1 ELSE 0 END,
          inflation_pct DESC`
      )
      .all(...params) as KategorienInflationItem[]

    return NextResponse.json({ items: rows, include_excluded: includeExcluded })
  } catch (e) {
    console.error("[/api/statistiken/kategorien-inflation] Error:", e)
    return NextResponse.json({ items: [], include_excluded: false }, { status: 500 })
  }
}
