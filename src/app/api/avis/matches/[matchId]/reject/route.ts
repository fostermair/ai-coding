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

    const db = getDb()

    // Fetch the match
    interface AvisMatch {
      id: number
      status: string
    }
    const match = db
      .prepare("SELECT id, status FROM avis_matches WHERE id = ?")
      .get(id) as AvisMatch | undefined

    if (!match) {
      return NextResponse.json({ message: "Match nicht gefunden" }, { status: 404 })
    }

    // Update match status to rejected
    db.prepare("UPDATE avis_matches SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(id)

    return NextResponse.json({
      success: true,
      matchId: id,
      status: "rejected",
      message: "Match abgelehnt",
    })
  } catch (e) {
    console.error("[/api/avis/matches/[matchId]/reject] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
