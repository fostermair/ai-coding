import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { suggestAlias } from "@/lib/avis-matching"

export async function GET() {
  try {
    const db = getDb()

    const unmapped = db
      .prepare(
        `SELECT ri.raw_name, COUNT(*) as purchase_count, MAX(r.receipt_date) as last_bon_date,
                (SELECT am2.avis_item_name
                 FROM avis_matches am2
                 JOIN receipt_items ri2 ON ri2.id = am2.receipt_item_id
                 WHERE ri2.raw_name = ri.raw_name
                   AND am2.status IN ('auto_set', 'confirmed')
                 ORDER BY am2.confidence DESC LIMIT 1) as avis_suggestion,
                (SELECT MAX(am2.confidence)
                 FROM avis_matches am2
                 JOIN receipt_items ri2 ON ri2.id = am2.receipt_item_id
                 WHERE ri2.raw_name = ri.raw_name
                   AND am2.status IN ('auto_set', 'confirmed')) as avis_confidence
         FROM receipt_items ri
         JOIN receipts r ON ri.receipt_id = r.id
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE pa.raw_name IS NULL OR COALESCE(pa.alias, '') = ''
         GROUP BY ri.raw_name
         ORDER BY purchase_count DESC, ri.raw_name ASC`
      )
      .all() as { raw_name: string; purchase_count: number; last_bon_date: string; avis_suggestion: string | null; avis_confidence: number | null }[]

    if (unmapped.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const existingAliases = db
      .prepare(`SELECT raw_name, alias FROM product_aliases WHERE alias IS NOT NULL AND alias != ''`)
      .all() as { raw_name: string; alias: string }[]

    const items = unmapped.map((row) => {
      const { suggestion, confidence } = suggestAlias(row.raw_name, existingAliases)
      return {
        raw_name: row.raw_name,
        purchase_count: row.purchase_count,
        last_bon_date: row.last_bon_date,
        suggestion,
        confidence,
        avis_suggestion: row.avis_suggestion ?? null,
        avis_confidence: row.avis_confidence ?? 0,
      }
    })

    return NextResponse.json({ items })
  } catch (e) {
    console.error("[/api/produkte/aliases/unmapped] GET Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
