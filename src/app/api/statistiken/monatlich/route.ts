import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface MonthRow {
  monat: string
  ausgaben_cents: number
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const monate = searchParams.get("monate") // 3, 6, 12 or null (all)

    let dateFilter = ""
    const params: string[] = []

    if (monate && ["3", "6", "12"].includes(monate)) {
      dateFilter = "WHERE r.receipt_date >= date('now', ?)"
      params.push(`-${monate} months`)
    }

    const rows = db
      .prepare(
        `SELECT
          strftime('%Y-%m', r.receipt_date) AS monat,
          SUM(r.total_amount_cents) AS ausgaben_cents
        FROM receipts r
        ${dateFilter}
        GROUP BY monat
        ORDER BY monat ASC`
      )
      .all(...params) as MonthRow[]

    // Calculate month-over-month comparison for the latest month
    let vergleich = null
    if (rows.length >= 2) {
      const current = rows[rows.length - 1]
      const previous = rows[rows.length - 2]
      const diff = current.ausgaben_cents - previous.ausgaben_cents
      const pct = previous.ausgaben_cents !== 0
        ? Math.round((diff / Math.abs(previous.ausgaben_cents)) * 100)
        : 0
      vergleich = {
        aktuell_monat: current.monat,
        vormonat: previous.monat,
        diff_cents: diff,
        diff_prozent: pct,
      }
    }

    return NextResponse.json({ monate: rows, vergleich })
  } catch (e) {
    console.error("[/api/statistiken/monatlich] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
