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

interface MultiStoreResponse {
  items: MultiStoreItem[]
  only_one_chain: boolean
  dominant_chain?: string
}

export async function GET(): Promise<NextResponse<MultiStoreResponse>> {
  try {
    const db = getDb()

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
        GROUP BY COALESCE(pa.alias, ri.raw_name), r.store_chain
        ORDER BY alias, avg_price_cents`
      )
      .all() as ChainRow[]

    const allChains = new Set(rows.map((r) => r.chain))
    const only_one_chain = allChains.size <= 1

    const chainCounts = new Map<string, number>()
    for (const row of rows) {
      chainCounts.set(row.chain, (chainCounts.get(row.chain) ?? 0) + 1)
    }
    const dominant_chain = [...chainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

    if (only_one_chain) {
      return NextResponse.json({ items: [], only_one_chain: true, dominant_chain })
    }

    const byAlias = new Map<string, ChainRow[]>()
    for (const row of rows) {
      if (!byAlias.has(row.alias)) byAlias.set(row.alias, [])
      byAlias.get(row.alias)!.push(row)
    }

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10)

    const items: MultiStoreItem[] = []

    for (const [alias, chainRows] of byAlias) {
      if (chainRows.length < 2) continue
      const hasRecentPurchase = chainRows.some((c) => c.last_purchase_date >= sixMonthsAgoStr)
      if (!hasRecentPurchase) continue

      const sorted = [...chainRows].sort((a, b) => a.avg_price_cents - b.avg_price_cents)
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

      items.push({
        alias,
        chains: chainRows.map((c) => ({
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
      })
    }

    items.sort((a, b) => b.delta_pct - a.delta_pct)

    return NextResponse.json({ items, only_one_chain: false })
  } catch (e) {
    console.error("[/api/statistiken/multi-store] Error:", e)
    return NextResponse.json({ items: [], only_one_chain: false }, { status: 500 })
  }
}
