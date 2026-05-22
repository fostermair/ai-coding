import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getDb } from "@/lib/db"

const HIDDEN_FILTERS: Record<string, string> = {
  "0": "AND bt.hidden = 0",
  "1": "AND bt.hidden = 1",
  all: "",
}

const querySchema = z.object({
  hidden: z.enum(["0", "1", "all"]).default("0"),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({ hidden: searchParams.get("hidden") ?? "0" })
    if (!parsed.success) {
      return NextResponse.json({ message: "Ungültiger hidden-Parameter" }, { status: 400 })
    }
    const hiddenFilter = HIDDEN_FILTERS[parsed.data.hidden]

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
