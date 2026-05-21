import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  try {
    const db = getDb()

    const transactions = db
      .prepare(
        `SELECT id, buchungsdatum, valutadatum, typ, beschreibung, haendler_name,
                empfaenger_name, verwendungszweck, betrag_cents, periode,
                match_status, matched_receipt_id, match_source
         FROM bank_transactions
         ORDER BY buchungsdatum DESC, id DESC`
      )
      .all()

    return NextResponse.json({ transactions })
  } catch (e) {
    console.error("[/api/konto/transactions] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
