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

    if (typeof body.excluded !== "boolean") {
      return NextResponse.json(
        { message: "Feld 'excluded' muss ein Boolean sein" },
        { status: 400 }
      )
    }

    const db = getDb()

    // Verify product exists in receipt_items
    const exists = db
      .prepare(
        "SELECT 1 FROM receipt_items WHERE raw_name = ? LIMIT 1"
      )
      .get(rawName)

    if (!exists) {
      return NextResponse.json({ message: "Produkt nicht gefunden" }, { status: 404 })
    }

    const excludedValue = body.excluded ? 1 : 0

    // Upsert: create or update the product_aliases row with the excluded flag.
    // If an alias already exists, preserve it.
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, updated_at)
       VALUES (?, '', ?, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET
         excluded_from_stats = excluded.excluded_from_stats,
         updated_at = excluded.updated_at`
    ).run(rawName, excludedValue)

    return NextResponse.json({
      raw_name: rawName,
      excluded_from_stats: body.excluded,
    })
  } catch (e) {
    console.error("[/api/produkte/[name]/exclude] PUT Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
