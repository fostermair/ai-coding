import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface SeasonMonth {
  monat: number
  avg_preis_cents: number
  kaufanzahl: number
}

interface SeasonResponse {
  raw_name: string
  seasonal: boolean
  monate: SeasonMonth[]
  warning?: string
}

// PATCH: Toggle seasonal flag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)

    if (!rawName) {
      return NextResponse.json({ message: "Produktname fehlt" }, { status: 400 })
    }

    const body = await request.json()

    if (typeof body.seasonal !== "boolean") {
      return NextResponse.json(
        { message: "Feld 'seasonal' muss ein Boolean sein" },
        { status: 400 }
      )
    }

    const db = getDb()

    // Verify product exists in receipt_items
    const exists = db
      .prepare("SELECT 1 FROM receipt_items WHERE raw_name = ? LIMIT 1")
      .get(rawName)

    if (!exists) {
      return NextResponse.json({ message: "Produkt nicht gefunden" }, { status: 404 })
    }

    const seasonalValue = body.seasonal ? 1 : 0

    // Upsert: create or update the product_aliases row with the seasonal flag.
    // On insert (new product): use defaults for alias and excluded_from_stats
    // On update (existing product): preserve alias and excluded_from_stats, only update seasonal
    const existingRow = db
      .prepare(
        "SELECT alias, excluded_from_stats FROM product_aliases WHERE raw_name = ?"
      )
      .get(rawName) as { alias: string; excluded_from_stats: number } | undefined

    if (existingRow) {
      // Update: preserve existing values
      db.prepare(
        `UPDATE product_aliases
         SET seasonal = ?, updated_at = datetime('now')
         WHERE raw_name = ?`
      ).run(seasonalValue, rawName)
    } else {
      // Insert: create new row with defaults
      db.prepare(
        `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, seasonal, updated_at)
         VALUES (?, '', 0, ?, datetime('now'))`
      ).run(rawName, seasonalValue)
    }

    return NextResponse.json({
      raw_name: rawName,
      seasonal: body.seasonal,
    })
  } catch (e) {
    console.error("[/api/produkte/[name]/saison] PATCH Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

// GET: Return per-month average prices and season data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)

    if (!rawName) {
      return NextResponse.json({ message: "Produktname fehlt" }, { status: 400 })
    }

    const db = getDb()

    // Check if product is marked as seasonal
    const productAlias = db
      .prepare(
        `SELECT COALESCE(seasonal, 0) AS seasonal
         FROM product_aliases
         WHERE raw_name = ?`
      )
      .get(rawName) as { seasonal: number } | undefined

    const seasonal = productAlias?.seasonal === 1

    // Get per-month average prices
    const monthlyData = db
      .prepare(
        `SELECT
          CAST(strftime('%m', r.receipt_date) AS INTEGER) AS monat,
          AVG(ri.unit_price_cents) AS avg_preis_cents,
          COUNT(*) AS kaufanzahl
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE ri.raw_name = ?
          AND ri.unit_price_cents > 0
        GROUP BY monat
        ORDER BY monat`
      )
      .all(rawName) as Array<{
      monat: number
      avg_preis_cents: number
      kaufanzahl: number
    }>

    // Build warning if insufficient data
    let warning: string | undefined
    const distinctMonths = new Set(monthlyData.map((m) => m.monat)).size

    if (distinctMonths < 2) {
      warning = "Zu wenig Daten für Saisonanalyse"
    } else {
      const totalPurchases = monthlyData.reduce((sum, m) => sum + m.kaufanzahl, 0)
      if (totalPurchases < 3) {
        warning = "Basiert auf wenigen Datenpunkten"
      }
    }

    const response: SeasonResponse = {
      raw_name: rawName,
      seasonal,
      monate: monthlyData,
    }

    if (warning) {
      response.warning = warning
    }

    return NextResponse.json(response)
  } catch (e) {
    console.error("[/api/produkte/[name]/saison] GET Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
