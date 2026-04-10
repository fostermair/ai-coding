import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface MonthDiscountRow {
  monat: string
  ersparnis_cents: number
}

interface TopDiscountRow {
  beschreibung: string
  anzahl: number
  gesamt_cents: number
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const monate = searchParams.get("monate")

    let dateFilter = ""
    const params: string[] = []

    if (monate && ["3", "6", "12"].includes(monate)) {
      dateFilter = "AND r.receipt_date >= date('now', ?)"
      params.push(`-${monate} months`)
    }

    // Total savings
    const totalRow = db
      .prepare(
        `SELECT COALESCE(SUM(id.amount_cents), 0) AS gesamt_cents
        FROM item_discounts id
        JOIN receipt_items ri ON ri.id = id.receipt_item_id
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE 1=1 ${dateFilter}`
      )
      .get(...params) as { gesamt_cents: number }

    // Monthly savings
    const monatlich = db
      .prepare(
        `SELECT
          strftime('%Y-%m', r.receipt_date) AS monat,
          SUM(id.amount_cents) AS ersparnis_cents
        FROM item_discounts id
        JOIN receipt_items ri ON ri.id = id.receipt_item_id
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE 1=1 ${dateFilter}
        GROUP BY monat
        ORDER BY monat ASC`
      )
      .all(...params) as MonthDiscountRow[]

    // Top discount actions
    const topAktionen = db
      .prepare(
        `SELECT
          id.description AS beschreibung,
          COUNT(*) AS anzahl,
          SUM(id.amount_cents) AS gesamt_cents
        FROM item_discounts id
        JOIN receipt_items ri ON ri.id = id.receipt_item_id
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE id.description IS NOT NULL AND id.description != ''
          ${dateFilter}
        GROUP BY id.description
        ORDER BY anzahl DESC
        LIMIT 5`
      )
      .all(...params) as TopDiscountRow[]

    return NextResponse.json({
      gesamt_ersparnis_cents: totalRow.gesamt_cents,
      monatlich,
      top_aktionen: topAktionen,
    })
  } catch (e) {
    console.error("[/api/statistiken/rabatte] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
