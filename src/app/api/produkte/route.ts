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

    // Normalize excluded_from_stats to boolean
    const productsNormalized = products.map((p) => ({
      ...p,
      excluded_from_stats: p.excluded_from_stats === 1,
    }))

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
