import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseUnit } from "@/lib/unit-parser"

export async function POST() {
  try {
    const db = getDb()

    const items = db
      .prepare(
        `SELECT id, raw_name, unit_price_cents
         FROM receipt_items
         WHERE normalized_amount IS NULL`
      )
      .all() as Array<{ id: number; raw_name: string; unit_price_cents: number }>

    const update = db.prepare(`
      UPDATE receipt_items
      SET normalized_amount = ?, normalized_unit = ?, price_per_unit_cents = ?
      WHERE id = ?
    `)

    let normalized = 0

    const doBackfill = db.transaction(() => {
      for (const item of items) {
        const result = parseUnit(item.raw_name, item.unit_price_cents)
        if (result.normalized_amount !== null) {
          update.run(
            result.normalized_amount,
            result.normalized_unit,
            result.price_per_unit_cents,
            item.id
          )
          normalized++
        }
      }
    })

    doBackfill()

    return NextResponse.json({
      total: items.length,
      normalized,
      skipped: items.length - normalized,
    })
  } catch (e) {
    console.error("[/api/admin/backfill-units] Error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Backfill" }, { status: 500 })
  }
}
