import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

const VALID_SOURCES = ["manual", "suggested", "avis"] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json({ message: "Keine Einträge angegeben" }, { status: 400 })
    }

    for (const item of items) {
      if (typeof item.raw_name !== "string" || !item.raw_name.trim()) {
        return NextResponse.json({ message: "Ungültiger raw_name" }, { status: 400 })
      }
      if (typeof item.alias !== "string" || !item.alias.trim()) {
        return NextResponse.json({ message: "Ungültiger alias" }, { status: 400 })
      }
      if (!VALID_SOURCES.includes(item.source)) {
        return NextResponse.json({ message: "Ungültige source" }, { status: 400 })
      }
    }

    const db = getDb()

    const stmt = db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, source, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(raw_name) DO NOTHING`
    )

    const runBulk = db.transaction(() => {
      let saved = 0
      for (const item of items) {
        const result = stmt.run(item.raw_name.trim(), item.alias.trim(), item.source)
        saved += result.changes
      }
      return saved
    })

    const saved = runBulk()

    return NextResponse.json({ success: true, saved })
  } catch (e) {
    console.error("[/api/produkte/aliases/bulk] POST Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

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
