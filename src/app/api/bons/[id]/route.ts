import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(
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

    const receipt = db
      .prepare("SELECT * FROM receipts WHERE id = ?")
      .get(bonId) as Record<string, unknown> | undefined

    if (!receipt) {
      return NextResponse.json({ message: "Bon nicht gefunden" }, { status: 404 })
    }

    // Fetch items with aliases
    const items = db
      .prepare(
        `SELECT ri.*, pa.alias
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.receipt_id = ?
         ORDER BY ri.position`
      )
      .all(bonId) as Array<Record<string, unknown>>

    // Fetch discounts for all items in one query
    const itemIds = items.map((i) => i.id)
    let discountMap: Map<number, Array<Record<string, unknown>>> = new Map()

    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => "?").join(",")
      const discounts = db
        .prepare(
          `SELECT * FROM item_discounts WHERE receipt_item_id IN (${placeholders}) ORDER BY id`
        )
        .all(...itemIds) as Array<Record<string, unknown>>

      for (const d of discounts) {
        const rid = d.receipt_item_id as number
        if (!discountMap.has(rid)) discountMap.set(rid, [])
        discountMap.get(rid)!.push(d)
      }
    }

    // Attach discounts to items
    const itemsWithDiscounts = items.map((item) => ({
      ...item,
      discounts: discountMap.get(item.id as number) ?? [],
    }))

    return NextResponse.json({
      ...receipt,
      items: itemsWithDiscounts,
    })
  } catch (e) {
    console.error("[/api/bons/[id]] GET Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

export async function DELETE(
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

    // CASCADE deletes receipt_items and item_discounts
    db.prepare("DELETE FROM receipts WHERE id = ?").run(bonId)

    return NextResponse.json({ message: "Bon gelöscht" })
  } catch (e) {
    console.error("[/api/bons/[id]] DELETE Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
