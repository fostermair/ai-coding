import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface PriceRow {
  datum: string
  einzelpreis_cents: number
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)
    const db = getDb()

    const rows = db
      .prepare(
        `SELECT
          r.receipt_date AS datum,
          ri.unit_price_cents AS einzelpreis_cents
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE ri.raw_name = ?
          AND (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND ri.unit_price_cents > 0
        ORDER BY r.receipt_date ASC, r.receipt_time ASC`
      )
      .all(rawName) as PriceRow[]

    if (rows.length < 2) {
      return NextResponse.json({ gesamt: null, jahre: [], inflation_cagr_pct: null })
    }

    const first = rows[0]
    const last = rows[rows.length - 1]
    const veraenderung_cents = last.einzelpreis_cents - first.einzelpreis_cents
    const veraenderung_prozent =
      first.einzelpreis_cents !== 0
        ? (veraenderung_cents / first.einzelpreis_cents) * 100
        : 0

    // Group by calendar year and compute average price per year
    const byYear = new Map<number, number[]>()
    for (const row of rows) {
      const jahr = parseInt(row.datum.slice(0, 4), 10)
      if (!byYear.has(jahr)) byYear.set(jahr, [])
      byYear.get(jahr)!.push(row.einzelpreis_cents)
    }

    const sortedYears = Array.from(byYear.keys()).sort()
    const currentYear = new Date().getFullYear()

    const jahre = sortedYears.map((jahr, i) => {
      const prices = byYear.get(jahr)!
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)

      // Determine if this year is partial
      let is_partial_year = false
      if (i === 0) {
        // First year: partial if first purchase is not on Jan 1
        is_partial_year = !rows[0].datum.startsWith(`${jahr}-01-01`)
      }
      if (jahr === currentYear) {
        // Current year: always partial (not yet complete)
        is_partial_year = true
      }

      if (i === 0) {
        return { jahr, avg_preis_cents: avg, veraenderung_cents: null, veraenderung_prozent: null, is_partial_year }
      }

      const prevJahr = sortedYears[i - 1]
      const prevPrices = byYear.get(prevJahr)!
      const prevAvg = Math.round(prevPrices.reduce((a, b) => a + b, 0) / prevPrices.length)
      const diff = avg - prevAvg
      const diffProzent = prevAvg !== 0 ? (diff / prevAvg) * 100 : 0

      return {
        jahr,
        avg_preis_cents: avg,
        veraenderung_cents: diff,
        veraenderung_prozent: Math.round(diffProzent * 10) / 10,
        is_partial_year,
      }
    })

    // Compute CAGR (Compound Annual Growth Rate)
    let inflation_cagr_pct: number | null = null
    if (sortedYears.length >= 2) {
      const firstYear = sortedYears[0]
      const lastYear = sortedYears[sortedYears.length - 1]
      const yearDistance = lastYear - firstYear

      const firstYearPrices = byYear.get(firstYear)!
      const lastYearPrices = byYear.get(lastYear)!

      const firstYearAvg = firstYearPrices.reduce((a, b) => a + b, 0) / firstYearPrices.length
      const lastYearAvg = lastYearPrices.reduce((a, b) => a + b, 0) / lastYearPrices.length

      if (yearDistance > 0 && firstYearAvg > 0) {
        inflation_cagr_pct = Math.round((Math.pow(lastYearAvg / firstYearAvg, 1 / yearDistance) - 1) * 100 * 10) / 10
      }
    }

    return NextResponse.json({
      gesamt: {
        erster_kauf: { datum: first.datum, preis_cents: first.einzelpreis_cents },
        letzter_kauf: { datum: last.datum, preis_cents: last.einzelpreis_cents },
        veraenderung_cents,
        veraenderung_prozent: Math.round(veraenderung_prozent * 10) / 10,
      },
      jahre,
      inflation_cagr_pct,
    })
  } catch (e) {
    console.error("[/api/produkte/[name]/preisentwicklung] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
