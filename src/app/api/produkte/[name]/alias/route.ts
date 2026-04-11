import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)

    if (!rawName) {
      return NextResponse.json({ message: "Produktname fehlt" }, { status: 400 })
    }

    const body = await request.json()
    const alias = typeof body.alias === "string" ? body.alias.trim() : ""

    if (!alias) {
      return NextResponse.json({ message: "Alias darf nicht leer sein" }, { status: 400 })
    }

    if (alias.length > 200) {
      return NextResponse.json({ message: "Alias zu lang (max. 200 Zeichen)" }, { status: 400 })
    }

    const db = getDb()

    // Verify product exists in receipt_items
    const exists = db
      .prepare("SELECT 1 FROM receipt_items WHERE raw_name = ? LIMIT 1")
      .get(rawName)

    if (!exists) {
      return NextResponse.json({ message: "Produkt nicht gefunden" }, { status: 404 })
    }

    // Upsert alias
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at`
    ).run(rawName, alias)

    return NextResponse.json({ raw_name: rawName, alias })
  } catch (e) {
    console.error("[/api/produkte/[name]/alias] PUT Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)

    if (!rawName) {
      return NextResponse.json({ message: "Produktname fehlt" }, { status: 400 })
    }

    const db = getDb()

    // Check if alias exists at all
    const existing = db
      .prepare("SELECT alias, excluded_from_stats FROM product_aliases WHERE raw_name = ?")
      .get(rawName) as { alias: string; excluded_from_stats: number } | undefined

    if (!existing || !existing.alias) {
      return NextResponse.json({ message: "Kein Alias vorhanden" }, { status: 404 })
    }

    if (existing.excluded_from_stats) {
      // Row must remain (has exclusion flag) — just clear the alias field
      db.prepare(
        "UPDATE product_aliases SET alias = '', updated_at = datetime('now') WHERE raw_name = ?"
      ).run(rawName)
    } else {
      // No exclusion flag — safe to delete the whole row
      db.prepare("DELETE FROM product_aliases WHERE raw_name = ?").run(rawName)
    }

    return NextResponse.json({ message: "Alias gelöscht" })
  } catch (e) {
    console.error("[/api/produkte/[name]/alias] DELETE Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
