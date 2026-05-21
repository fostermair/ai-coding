import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { runMatching } from "@/lib/konto-matching"

export async function POST() {
  try {
    const db = getDb()
    const summary = runMatching(db)
    return NextResponse.json(summary)
  } catch (e) {
    console.error("[/api/konto/match] Error:", e)
    return NextResponse.json({ message: "Fehler beim Matching" }, { status: 500 })
  }
}
