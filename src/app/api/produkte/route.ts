import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

type SortKey = "frequency" | "name" | "last_purchase"
type FilterKey = "all" | "active" | "excluded"

const ORDER_CLAUSES: Record<SortKey, string> = {
  frequency: "purchase_count DESC, ri.raw_name ASC",
  name: "display_name ASC",
  last_purchase: "last_purchase_date DESC, ri.raw_name ASC",
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q")?.trim() ?? ""
    const sort = (searchParams.get("sort") ?? "frequency") as SortKey
    const filter = (searchParams.get("filter") ?? "all") as FilterKey

    if (!ORDER_CLAUSES[sort]) {
      return NextResponse.json({ message: "Ungültiger Sortierparameter" }, { status: 400 })
    }

    if (!["all", "active", "excluded"].includes(filter)) {
      return NextResponse.json({ message: "Ungültiger Filterparameter" }, { status: 400 })
    }

    const orderBy = ORDER_CLAUSES[sort]

    // Build HAVING clause combining search and filter
    const havingParts: string[] = []
    const params: string[] = []

    if (q) {
      havingParts.push("(ri.raw_name LIKE ? OR display_name LIKE ?)")
      const like = `%${q}%`
      params.push(like, like)
    }

    if (filter === "active") {
      havingParts.push("COALESCE(pa.excluded_from_stats, 0) = 0")
    } else if (filter === "excluded") {
      havingParts.push("COALESCE(pa.excluded_from_stats, 0) = 1")
    }

    const havingClause =
      havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : ""

    const products = db
      .prepare(
        `SELECT
          ri.raw_name,
          NULLIF(pa.alias, '') AS alias,
          COALESCE(NULLIF(pa.alias, ''), ri.raw_name) AS display_name,
          COALESCE(pa.excluded_from_stats, 0) AS excluded_from_stats,
          COUNT(*) AS purchase_count,
          (SELECT ri2.total_price_cents
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
           ORDER BY r2.receipt_date DESC, r2.receipt_time DESC
           LIMIT 1) AS last_price_cents,
          (SELECT ri2.total_price_cents
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
             AND ri2.total_price_cents > 0
             AND r2.receipt_date >= DATE('now', '-12 months')
           ORDER BY r2.receipt_date ASC, r2.receipt_time ASC
           LIMIT 1) AS first_price_cents,
          (SELECT ri2.total_price_cents
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
             AND r2.receipt_date >= DATE('now', '-12 months')
           ORDER BY r2.receipt_date DESC, r2.receipt_time DESC
           LIMIT 1) AS trend_last_price_cents,
          (SELECT COUNT(*)
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
             AND ri2.total_price_cents > 0
             AND r2.receipt_date >= DATE('now', '-12 months')) AS price_data_count,
          (SELECT r2.receipt_date
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
             AND ri2.total_price_cents > 0
             AND r2.receipt_date >= DATE('now', '-12 months')
           ORDER BY r2.receipt_date ASC, r2.receipt_time ASC
           LIMIT 1) AS trend_from_date,
          (SELECT r2.receipt_date
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
             AND r2.receipt_date >= DATE('now', '-12 months')
           ORDER BY r2.receipt_date DESC, r2.receipt_time DESC
           LIMIT 1) AS trend_to_date,
          (SELECT AVG(ri2.unit_price_cents)
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
             AND ri2.unit_price_cents > 0
             AND strftime('%Y', r2.receipt_date) = (
               SELECT MIN(strftime('%Y', r3.receipt_date))
               FROM receipt_items ri3
               JOIN receipts r3 ON r3.id = ri3.receipt_id
               WHERE ri3.raw_name = ri.raw_name AND ri3.unit_price_cents > 0
             )
          ) AS cagr_first_avg,
          (SELECT AVG(ri2.unit_price_cents)
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name
             AND ri2.unit_price_cents > 0
             AND strftime('%Y', r2.receipt_date) = (
               SELECT MAX(strftime('%Y', r3.receipt_date))
               FROM receipt_items ri3
               JOIN receipts r3 ON r3.id = ri3.receipt_id
               WHERE ri3.raw_name = ri.raw_name AND ri3.unit_price_cents > 0
             )
          ) AS cagr_last_avg,
          (SELECT
             CAST(MAX(strftime('%Y', r2.receipt_date)) AS INTEGER) -
             CAST(MIN(strftime('%Y', r2.receipt_date)) AS INTEGER)
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name AND ri2.unit_price_cents > 0
          ) AS cagr_year_dist,
          (SELECT COUNT(DISTINCT strftime('%Y', r2.receipt_date))
           FROM receipt_items ri2
           JOIN receipts r2 ON r2.id = ri2.receipt_id
           WHERE ri2.raw_name = ri.raw_name AND ri2.unit_price_cents > 0
          ) AS cagr_year_count,
          MAX(r.receipt_date) AS last_purchase_date
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
        WHERE ri.item_type = 'product' OR ri.item_type = 'concession'
        GROUP BY ri.raw_name
        ${havingClause}
        ORDER BY ${orderBy}`
      )
      .all(...params) as Array<Record<string, unknown>>

    // Normalize and compute derived fields
    const productsNormalized = products.map((p) => {
      const first = p.first_price_cents as number | null
      const trendLast = p.trend_last_price_cents as number | null
      const count = p.price_data_count as number

      const price_trend_pct =
        count >= 2 && first != null && first !== 0 && trendLast != null && trendLast > 0
          ? ((trendLast - first) / first) * 100
          : null

      // Compute CAGR (Compound Annual Growth Rate)
      const cagrFirst = p.cagr_first_avg as number | null
      const cagrLast = p.cagr_last_avg as number | null
      const cagrDist = p.cagr_year_dist as number
      const cagrCount = p.cagr_year_count as number

      const inflation_cagr_pct =
        cagrCount >= 2 && cagrDist > 0 && cagrFirst != null && cagrFirst > 0 && cagrLast != null
          ? Math.round((Math.pow(cagrLast / cagrFirst, 1 / cagrDist) - 1) * 100 * 10) / 10
          : null

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { price_data_count: _drop, trend_last_price_cents: _drop2, cagr_first_avg: _drop3, cagr_last_avg: _drop4, cagr_year_dist: _drop5, cagr_year_count: _drop6, ...rest } = p
      return {
        ...rest,
        excluded_from_stats: p.excluded_from_stats === 1,
        price_trend_pct,
        trend_from_date: (p.trend_from_date as string | null) ?? null,
        trend_to_date: (p.trend_to_date as string | null) ?? null,
        inflation_cagr_pct,
      }
    })

    // Total unique product count (unfiltered, always)
    const totalRow = db
      .prepare(
        `SELECT COUNT(DISTINCT raw_name) AS total_count
         FROM receipt_items
         WHERE item_type = 'product' OR item_type = 'concession'`
      )
      .get() as { total_count: number }

    // Count of excluded products (always, regardless of current filter)
    const excludedRow = db
      .prepare(
        `SELECT COUNT(DISTINCT ri.raw_name) AS excluded_count
         FROM receipt_items ri
         JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE (ri.item_type = 'product' OR ri.item_type = 'concession')
           AND pa.excluded_from_stats = 1`
      )
      .get() as { excluded_count: number }

    return NextResponse.json({
      products: productsNormalized,
      total_count: totalRow.total_count,
      excluded_count: excludedRow.excluded_count,
    })
  } catch (e) {
    console.error("[/api/produkte] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
