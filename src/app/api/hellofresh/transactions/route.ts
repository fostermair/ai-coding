import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, bestellnummer, datum, produkt, portionen, personen,
              grundpreis_cents, liefergebuehren_cents, rabatt_cents,
              hf_cash_cents, gesamt_cents, status, importiert_am
       FROM hellofresh_transactions
       ORDER BY datum DESC, id DESC`
    )
    .all()

  return NextResponse.json({ transactions: rows })
}
