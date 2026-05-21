import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function DELETE(_request: NextRequest) {
  try {
    const db = getDb()

    // Count existing aliases
    interface CountResult {
      count: number
    }
    const countResult = db
      .prepare("SELECT COUNT(*) as count FROM product_aliases")
      .get() as CountResult

    const count = countResult.count

    if (count === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "Keine Alias zum Löschen vorhanden",
      })
    }

    // Delete all product_aliases
    db.prepare("DELETE FROM product_aliases").run()

    return NextResponse.json({
      success: true,
      count,
      message: `Alle Alias gelöscht. ${count} Einträge zurückgesetzt.`,
    })
  } catch (e) {
    console.error("[/api/produkte/aliases/bulk] DELETE Error:", e)
    return NextResponse.json(
      { success: false, message: "Fehler beim Löschen der Alias aufgetreten" },
      { status: 500 }
    )
  }
}
