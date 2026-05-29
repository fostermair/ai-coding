import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { categorize, getAllCategories } from "@/lib/categorization/engine"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const rawName = decodeURIComponent(name)
    const body = await request.json()
    const { category } = body

    if (!category || typeof category !== "string") {
      return NextResponse.json({ message: "category fehlt" }, { status: 400 })
    }

    const validCategories = getAllCategories().map((c) => c.slug)
    if (!validCategories.includes(category)) {
      return NextResponse.json({ message: "Ungültige Kategorie" }, { status: 400 })
    }

    const db = getDb()
    db.prepare(
      `INSERT INTO product_categories (alias, category, source, updated_at)
       VALUES (?, ?, 'manual', datetime('now'))
       ON CONFLICT(alias) DO UPDATE SET
         category = excluded.category,
         source = 'manual',
         updated_at = excluded.updated_at`
    ).run(rawName, category)

    return NextResponse.json({ ok: true, raw_name: rawName, category, source: "manual" })
  } catch (e) {
    console.error("[/api/produkte/[name]/category PUT]", e)
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

    const db = getDb()
    const aliasRow = db
      .prepare("SELECT alias FROM product_aliases WHERE raw_name = ?")
      .get(rawName) as { alias: string } | undefined
    const alias = aliasRow?.alias || undefined

    const category = categorize(rawName, alias)

    db.prepare(
      `INSERT INTO product_categories (alias, category, source, updated_at)
       VALUES (?, ?, 'auto', datetime('now'))
       ON CONFLICT(alias) DO UPDATE SET
         category = excluded.category,
         source = 'auto',
         updated_at = excluded.updated_at`
    ).run(rawName, category)

    return NextResponse.json({ ok: true, raw_name: rawName, category, source: "auto" })
  } catch (e) {
    console.error("[/api/produkte/[name]/category DELETE]", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
