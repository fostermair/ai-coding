import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const bonId = parseInt(id, 10)
    if (isNaN(bonId)) {
      return NextResponse.json({ message: "Ungültige Bon-ID" }, { status: 400 })
    }

    const db = getDb()

    const existing = db
      .prepare("SELECT id FROM receipts WHERE id = ?")
      .get(bonId)

    if (!existing) {
      return NextResponse.json({ message: "Bon nicht gefunden" }, { status: 404 })
    }

    db.prepare("UPDATE receipts SET needs_reparse = 1 WHERE id = ?").run(bonId)

    return NextResponse.json({ message: "Bon wird beim nächsten Paperless-Sync neu eingelesen" })
  } catch (e) {
    console.error("[/api/bons/[id]/reparse] POST Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
