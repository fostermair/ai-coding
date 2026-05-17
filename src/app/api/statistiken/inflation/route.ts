import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface InflationRow {
  raw_name: string
  alias: string | null
  aktuelles_jahr: number
  vorjahr: number
  avg_vorjahr_cents: number
  avg_aktuell_cents: number
  aenderung_prozent: number
  combined_spend_cents: number
}

interface InflationProdukt {
  raw_name: string
  alias: string | null
  avg_vorjahr_cents: number
  avg_aktuell_cents: number
  aenderung_prozent: number
}

interface InflationResponse {
  teuer: InflationProdukt[]           // Top 10 with highest % increase
  guenstiger: InflationProdukt[]      // Top 10 with biggest % decrease (biggest decrease first)
  korb: {
    aenderung_prozent: number
    anzahl_produkte: number
    teuer_count: number
    guenstiger_count: number
    aktuelles_jahr: number
    vorjahr: number
  } | null
}

export async function GET(): Promise<NextResponse<InflationResponse>> {
  try {
    const db = getDb()

    const rows = db
      .prepare(
        `WITH yearly_avg AS (
          SELECT
            ri.raw_name,
            strftime('%Y', r.receipt_date) AS jahr,
            AVG(ri.unit_price_cents) AS avg_cents,
            SUM(ri.total_price_cents) AS total_spend_cents
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri.receipt_id
          LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
          WHERE ri.unit_price_cents > 0
            AND (ri.item_type = 'product' OR ri.item_type = 'concession')
            AND COALESCE(pa.excluded_from_stats, 0) = 0
            AND ri.raw_name IS NOT NULL AND ri.raw_name != ''
            AND strftime('%Y', r.receipt_date) IN (
                  strftime('%Y', 'now'),
                  strftime('%Y', 'now', '-1 year')
                )
          GROUP BY ri.raw_name, strftime('%Y', r.receipt_date)
        ),
        yoy AS (
          SELECT
            curr.raw_name,
            CAST(curr.jahr AS INTEGER) AS aktuelles_jahr,
            CAST(prev.jahr AS INTEGER) AS vorjahr,
            ROUND(prev.avg_cents) AS avg_vorjahr_cents,
            ROUND(curr.avg_cents) AS avg_aktuell_cents,
            ROUND((curr.avg_cents - prev.avg_cents) / prev.avg_cents * 100, 1) AS aenderung_prozent,
            curr.total_spend_cents + prev.total_spend_cents AS combined_spend_cents
          FROM yearly_avg curr
          JOIN yearly_avg prev
            ON  prev.raw_name = curr.raw_name
            AND prev.jahr = strftime('%Y', 'now', '-1 year')
            AND curr.jahr = strftime('%Y', 'now')
        )
        SELECT yoy.raw_name, pa.alias, yoy.aktuelles_jahr, yoy.vorjahr,
               yoy.avg_vorjahr_cents, yoy.avg_aktuell_cents,
               yoy.aenderung_prozent, yoy.combined_spend_cents
        FROM yoy
        LEFT JOIN product_aliases pa ON pa.raw_name = yoy.raw_name
        ORDER BY yoy.aenderung_prozent DESC`
      )
      .all() as InflationRow[]

    // Filter out rows with invalid prior year average (guard against division by zero)
    const validRows = rows.filter((r) => r.avg_vorjahr_cents > 0)

    // Top 10 most expensive (highest % increase)
    const teuer = validRows.slice(0, 10).map((r) => ({
      raw_name: r.raw_name,
      alias: r.alias,
      avg_vorjahr_cents: r.avg_vorjahr_cents,
      avg_aktuell_cents: r.avg_aktuell_cents,
      aenderung_prozent: r.aenderung_prozent,
    }))

    // Top 10 most cheap (lowest % increase, i.e., biggest decrease) - reversed so biggest decrease is first
    const guenstiger = validRows
      .slice(-10)
      .reverse()
      .map((r) => ({
        raw_name: r.raw_name,
        alias: r.alias,
        avg_vorjahr_cents: r.avg_vorjahr_cents,
        avg_aktuell_cents: r.avg_aktuell_cents,
        aenderung_prozent: r.aenderung_prozent,
      }))

    // Calculate basket inflation (weighted average)
    let korb: InflationResponse["korb"] = null

    if (validRows.length > 0) {
      const weightedSum = validRows.reduce(
        (acc, r) => acc + r.aenderung_prozent * r.combined_spend_cents,
        0
      )
      const totalWeight = validRows.reduce((acc, r) => acc + r.combined_spend_cents, 0)
      const basketInflation = totalWeight > 0 ? weightedSum / totalWeight : 0
      const teuerCount = validRows.filter((r) => r.aenderung_prozent > 0).length
      const guenstigerCount = validRows.filter((r) => r.aenderung_prozent < 0).length

      korb = {
        aenderung_prozent: Math.round(basketInflation * 10) / 10, // 1 decimal place
        anzahl_produkte: validRows.length,
        teuer_count: teuerCount,
        guenstiger_count: guenstigerCount,
        aktuelles_jahr: validRows[0]!.aktuelles_jahr,
        vorjahr: validRows[0]!.vorjahr,
      }
    }

    return NextResponse.json({
      teuer,
      guenstiger,
      korb,
    })
  } catch (e) {
    console.error("[/api/statistiken/inflation] Error:", e)
    return NextResponse.json(
      { teuer: [], guenstiger: [], korb: null } as InflationResponse,
      { status: 500 }
    )
  }
}
