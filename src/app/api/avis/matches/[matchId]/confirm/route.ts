import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params
    const id = parseInt(matchId, 10)
    if (isNaN(id)) {
      return NextResponse.json({ message: "Ungültige Match-ID" }, { status: 400 })
    }

    const body = await request.json()
    const confirmedAlias = typeof body.confirmed_alias === "string" ? body.confirmed_alias.trim() : ""

    if (!confirmedAlias) {
      return NextResponse.json({ message: "Bestätigter Alias erforderlich" }, { status: 400 })
    }

    const db = getDb()

    // Fetch the match
    interface AvisMatch {
      id: number
      receipt_id: number
      receipt_item_id: number | null
      status: string
      avis_item_name: string
    }
    const match = db
      .prepare("SELECT * FROM avis_matches WHERE id = ?")
      .get(id) as AvisMatch | undefined

    if (!match) {
      return NextResponse.json({ message: "Match nicht gefunden" }, { status: 404 })
    }

    if (match.status !== "pending") {
      return NextResponse.json(
        { message: `Match hat Status '${match.status}', kann nur 'pending' bestätigt werden` },
        { status: 400 }
      )
    }

    // Find the receipt_item to get raw_name
    interface ReceiptItem {
      raw_name: string
    }
    const item = db
      .prepare("SELECT raw_name FROM receipt_items WHERE id = ?")
      .get(match.receipt_item_id) as ReceiptItem | undefined

    if (!item) {
      return NextResponse.json({ message: "Artikel nicht gefunden" }, { status: 404 })
    }

    // Save the alias via the existing alias endpoint logic
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at`
    ).run(item.raw_name, confirmedAlias)

    // Update match status to confirmed
    db.prepare("UPDATE avis_matches SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?").run(id)

    return NextResponse.json({
      success: true,
      matchId: id,
      status: "confirmed",
      alias: confirmedAlias,
      message: "Match bestätigt und Alias gespeichert",
    })
  } catch (e) {
    console.error("[/api/avis/matches/[matchId]/confirm] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
