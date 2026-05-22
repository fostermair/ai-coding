import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hiddenParam = searchParams.get("hidden") ?? "0"

    let hiddenFilter: string
    if (hiddenParam === "1") hiddenFilter = "AND bt.hidden = 1"
    else if (hiddenParam === "all") hiddenFilter = ""
    else hiddenFilter = "AND bt.hidden = 0"

    const db = getDb()

    const transactions = db
      .prepare(
        `SELECT bt.id, bt.buchungsdatum, bt.valutadatum, bt.typ, bt.beschreibung,
                bt.haendler_name, bt.empfaenger_name, bt.verwendungszweck,
                bt.betrag_cents, bt.periode, bt.kontoauszug_datei,
                bt.match_status, bt.matched_receipt_id, bt.match_source,
                bt.hidden,
                ta.alias, ta.logo_path
         FROM bank_transactions bt
         LEFT JOIN transaction_aliases ta ON ta.beschreibung = bt.beschreibung
         WHERE 1=1 ${hiddenFilter}
         ORDER BY bt.buchungsdatum DESC, bt.id DESC`
      )
      .all()

    return NextResponse.json({ transactions })
  } catch (e) {
    console.error("[/api/konto/transactions] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
