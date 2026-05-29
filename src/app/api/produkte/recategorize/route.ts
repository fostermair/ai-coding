import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { categorize } from "@/lib/categorization/engine"

export async function POST() {
  try {
    const db = getDb()

    const autoEntries = db
      .prepare(
        `SELECT pc.alias AS raw_name, pa.alias AS alias_name
         FROM product_categories pc
         LEFT JOIN product_aliases pa ON pa.raw_name = pc.alias
         WHERE pc.source = 'auto'`
      )
      .all() as Array<{ raw_name: string; alias_name: string | null }>

    const allProducts = db
      .prepare(
        `SELECT DISTINCT ri.raw_name,
                (SELECT pa.alias FROM product_aliases pa WHERE pa.raw_name = ri.raw_name) AS alias_name
         FROM receipt_items ri
         WHERE ri.item_type = 'product' OR ri.item_type = 'concession'`
      )
      .all() as Array<{ raw_name: string; alias_name: string | null }>

    const manualRawNames = new Set(
      (db
        .prepare("SELECT alias FROM product_categories WHERE source = 'manual'")
        .all() as Array<{ alias: string }>).map((r) => r.alias)
    )

    const upsertStmt = db.prepare(
      `INSERT INTO product_categories (alias, category, source, updated_at)
       VALUES (?, ?, 'auto', datetime('now'))
       ON CONFLICT(alias) DO UPDATE SET
         category = excluded.category,
         updated_at = excluded.updated_at
       WHERE source = 'auto'`
    )

    let updated = 0
    let skipped = 0

    const run = db.transaction(() => {
      for (const row of allProducts) {
        if (manualRawNames.has(row.raw_name)) {
          skipped++
          continue
        }
        const category = categorize(row.raw_name, row.alias_name ?? undefined)
        upsertStmt.run(row.raw_name, category)
        updated++
      }
    })
    run()

    const sonstiges = (
      db
        .prepare("SELECT COUNT(*) AS n FROM product_categories WHERE category = 'sonstiges'")
        .get() as { n: number }
    ).n

    return NextResponse.json({ ok: true, updated, skipped, sonstiges })
  } catch (e) {
    console.error("[/api/produkte/recategorize POST]", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
