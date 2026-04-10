import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface TaxRow {
  tax_code: string
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

    const rows = db
      .prepare(
        `SELECT
          ri.tax_code,
          SUM(ri.total_price_cents) AS gesamt_cents
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        WHERE ri.tax_code IS NOT NULL
          AND ri.unit_price_cents > 0
          AND (ri.item_type = 'product' OR ri.item_type = 'concession')
          ${dateFilter}
        GROUP BY ri.tax_code
        ORDER BY gesamt_cents DESC`
      )
      .all(...params) as TaxRow[]

    const gesamt = rows.reduce((sum, r) => sum + r.gesamt_cents, 0)

    const kategorien = rows.map((r) => ({
      tax_code: r.tax_code,
      label: r.tax_code === "A" ? "Lebensmittel (7%)" : r.tax_code === "B" ? "Nicht-Lebensmittel (19%)" : `Sonstige (${r.tax_code})`,
      gesamt_cents: r.gesamt_cents,
      anteil_prozent: gesamt > 0 ? Math.round((r.gesamt_cents / gesamt) * 100) : 0,
    }))

    return NextResponse.json({ kategorien, gesamt_cents: gesamt })
  } catch (e) {
    console.error("[/api/statistiken/mwst] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
