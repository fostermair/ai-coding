import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface ChainRow {
  alias: string
  chain: string
  avg_price_cents: number
  normalized_unit: string | null
  last_purchase_date: string
  is_stale: number
  is_normalized: number
}

interface MultiStoreChain {
  chain: string
  avg_price_cents: number
  normalized_unit: string | null
  last_purchase_date: string
  is_stale: boolean
  is_normalized: boolean
}

interface MultiStoreItem {
  alias: string
  chains: MultiStoreChain[]
  cheapest_chain: string
  priciest_chain: string
  delta_pct: number
}

interface ProductMultiStoreResponse {
  item: MultiStoreItem | null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse<ProductMultiStoreResponse>> {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)
    const db = getDb()

    // Resolve alias: if input is a raw_name, look up its alias; otherwise use as alias directly
    const aliasRow = db
      .prepare("SELECT alias FROM product_aliases WHERE raw_name = ?")
      .get(rawName) as { alias: string } | undefined
    const targetAlias = aliasRow?.alias ?? rawName

    const rows = db
      .prepare(
        `SELECT
          COALESCE(pa.alias, ri.raw_name) AS alias,
          r.store_chain AS chain,
          ROUND(AVG(CAST(COALESCE(ri.price_per_unit_cents, ri.unit_price_cents) AS REAL))) AS avg_price_cents,
          MAX(ri.normalized_unit) AS normalized_unit,
          MAX(r.receipt_date) AS last_purchase_date,
          CASE WHEN MAX(r.receipt_date) < DATE('now', '-6 months') THEN 1 ELSE 0 END AS is_stale,
          CASE WHEN COUNT(CASE WHEN ri.price_per_unit_cents IS NOT NULL THEN 1 END) > 0 THEN 1 ELSE 0 END AS is_normalized
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
        WHERE (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND ri.unit_price_cents > 0
          AND COALESCE(pa.excluded_from_stats, 0) = 0
          AND COALESCE(pa.alias, ri.raw_name) = ?
        GROUP BY COALESCE(pa.alias, ri.raw_name), r.store_chain
        ORDER BY avg_price_cents`
      )
      .all(targetAlias) as ChainRow[]

    if (rows.length < 2) {
      return NextResponse.json({ item: null })
    }

    const sorted = [...rows].sort((a, b) => a.avg_price_cents - b.avg_price_cents)
    const cheapest = sorted[0]
    const priciest = sorted[sorted.length - 1]
    const delta_pct =
      cheapest.avg_price_cents > 0
        ? Math.round(
            ((priciest.avg_price_cents - cheapest.avg_price_cents) /
              cheapest.avg_price_cents) *
              1000
          ) / 10
        : 0

    const item: MultiStoreItem = {
      alias: targetAlias,
      chains: rows.map((c) => ({
        chain: c.chain,
        avg_price_cents: c.avg_price_cents,
        normalized_unit: c.normalized_unit,
        last_purchase_date: c.last_purchase_date,
        is_stale: c.is_stale === 1,
        is_normalized: c.is_normalized === 1,
      })),
      cheapest_chain: cheapest.chain,
      priciest_chain: priciest.chain,
      delta_pct,
    }

    return NextResponse.json({ item })
  } catch (e) {
    console.error("[/api/produkte/[name]/multi-store] Error:", e)
    return NextResponse.json({ item: null }, { status: 500 })
  }
}
