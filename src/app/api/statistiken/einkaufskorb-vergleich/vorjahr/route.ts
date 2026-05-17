import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface EinkaufsverbgleichResponse {
  kann_vergleichen: boolean
  reason?: string
  letzter_einkauf?: { datum: string; gesamt_cents: number }
  vergleich?: { datum: string; typ: "vorjahr"; gesamt_cents: number }
  vergleich_stats?: {
    differenz_cents: number
    differenz_prozent: number
    produkte_gezaehlt: number
    produkte_gesamt: number
  }
}

export async function GET(): Promise<NextResponse<EinkaufsverbgleichResponse>> {
  try {
    const db = getDb()

    // 1. Get last receipt
    const lastReceiptRow = db
      .prepare("SELECT id, receipt_date FROM receipts ORDER BY receipt_date DESC LIMIT 1")
      .get() as { id: number; receipt_date: string } | undefined

    if (!lastReceiptRow) {
      return NextResponse.json({
        kann_vergleichen: false,
        reason: "Nur ein Einkauf vorhanden",
      })
    }

    // 2. Get products from last receipt (exclude excluded_from_stats)
    const lastProducts = db
      .prepare(
        `SELECT ri.raw_name, ri.unit_price_cents
       FROM receipt_items ri
       LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
       WHERE ri.receipt_id = ?
         AND ri.unit_price_cents > 0
         AND (ri.item_type = 'product' OR ri.item_type = 'concession')
         AND COALESCE(pa.excluded_from_stats, 0) = 0
       ORDER BY ri.raw_name`
      )
      .all(lastReceiptRow.id) as Array<{ raw_name: string; unit_price_cents: number }>

    if (lastProducts.length === 0) {
      return NextResponse.json({
        kann_vergleichen: false,
        reason: "Keine Vorjahresdaten verfügbar",
      })
    }

    const lastReceiptTotal = lastProducts.reduce((sum, p) => sum + p.unit_price_cents, 0)

    // 3. Calculate target date (1 year ago)
    const lastDate = new Date(lastReceiptRow.receipt_date)
    const targetDate = new Date(lastDate)
    targetDate.setFullYear(targetDate.getFullYear() - 1)
    const targetDateStr = targetDate.toISOString().split("T")[0]

    // 4. For each product, find the closest purchase within ±30 days of target date
    // using a CTE to find the nearest match per product
    const productNames = lastProducts.map((p) => p.raw_name)
    const placeholders = productNames.map(() => "?").join(",")

    const yearAgoMatches = db
      .prepare(
        `WITH candidates AS (
       SELECT
         ri.raw_name,
         ri.unit_price_cents,
         r.receipt_date,
         ABS(julianday(r.receipt_date) - julianday(?)) as date_diff,
         ROW_NUMBER() OVER (PARTITION BY ri.raw_name ORDER BY ABS(julianday(r.receipt_date) - julianday(?)) ASC) as rn
       FROM receipt_items ri
       JOIN receipts r ON r.id = ri.receipt_id
       WHERE ri.raw_name IN (${placeholders})
         AND ri.unit_price_cents > 0
         AND (ri.item_type = 'product' OR ri.item_type = 'concession')
         AND ABS(julianday(r.receipt_date) - julianday(?)) <= 30
         AND r.id != ?
     )
     SELECT raw_name, unit_price_cents, receipt_date
     FROM candidates
     WHERE rn = 1`
      )
      .all(targetDateStr, targetDateStr, ...productNames, targetDateStr, lastReceiptRow.id) as Array<{
        raw_name: string
        unit_price_cents: number
        receipt_date: string
      }>

    if (yearAgoMatches.length === 0) {
      return NextResponse.json({
        kann_vergleichen: false,
        reason: "Keine Vorjahresdaten verfügbar",
      })
    }

    // 5. Calculate totals and statistics
    const yearAgoTotal = yearAgoMatches.reduce((sum, p) => sum + p.unit_price_cents, 0)
    const differenzCents = lastReceiptTotal - yearAgoTotal
    const differenzProzent =
      yearAgoTotal > 0 ? Math.round((differenzCents / yearAgoTotal) * 1000) / 10 : 0

    // Get the date of the closest year-ago receipt
    const comparisonDate = yearAgoMatches[0]!.receipt_date

    return NextResponse.json({
      kann_vergleichen: true,
      letzter_einkauf: {
        datum: lastReceiptRow.receipt_date,
        gesamt_cents: lastReceiptTotal,
      },
      vergleich: {
        datum: comparisonDate,
        typ: "vorjahr",
        gesamt_cents: yearAgoTotal,
      },
      vergleich_stats: {
        differenz_cents: differenzCents,
        differenz_prozent: differenzProzent,
        produkte_gezaehlt: yearAgoMatches.length,
        produkte_gesamt: lastProducts.length,
      },
    })
  } catch (e) {
    console.error("[/api/statistiken/einkaufskorb-vergleich/vorjahr] Error:", e)
    return NextResponse.json(
      { kann_vergleichen: false, reason: "Interner Fehler" } as EinkaufsverbgleichResponse,
      { status: 500 }
    )
  }
}
