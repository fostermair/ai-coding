import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { computeMatchScore } from "@/lib/avis-matching"

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

    // Fetch items with aliases and AVIS match data
    const items = db
      .prepare(
        `SELECT ri.*, pa.alias
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.receipt_id = ?
         ORDER BY ri.position`
      )
      .all(bonId) as Array<Record<string, unknown>>

    // Fetch AVIS matches for this receipt
    const avisMatches = db
      .prepare(
        `SELECT id, receipt_item_id, avis_item_name, avis_unit_price_cents, confidence, status, match_source
         FROM avis_matches
         WHERE receipt_id = ?`
      )
      .all(bonId) as Array<{ id: number; receipt_item_id: number | null; avis_item_name: string; avis_unit_price_cents: number; confidence: number; status: string; match_source: string | null }>

    // Create a map of receipt_item_id -> avis_match
    const avisMatchMap = new Map<number, typeof avisMatches[0]>()
    for (const match of avisMatches) {
      if (match.receipt_item_id) {
        avisMatchMap.set(match.receipt_item_id, match)
      }
    }

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

    // Attach discounts and AVIS matches to items
    const itemsWithDiscounts = items.map((item) => {
      const itemId = item.id as number
      const avisMatch = avisMatchMap.get(itemId)
      return {
        ...item,
        discounts: discountMap.get(itemId) ?? [],
        avis_match: avisMatch
          ? {
              matchId: avisMatch.id,
              avisItemName: avisMatch.avis_item_name,
              avisUnitPriceCents: avisMatch.avis_unit_price_cents,
              confidence: avisMatch.confidence,
              status: avisMatch.status,
              match_source: avisMatch.match_source,
            }
          : undefined,
      }
    })

    // Check if this receipt has any AVIS matches (for showing edit button)
    const hasAvis = avisMatches.length > 0

    // Check if this receipt has bestellung items (PROJ-32)
    // Find order_number via total amount matching
    let bestellungItems: Array<{
      article_name: string
      quantity_amount: number
      quantity_unit: string
      unit_price_cents: number
      total_price_cents: number
    }> = []
    let hasBestellung = false
    let bestellungOrderNumber: string | null = null

    // Find matching bestellung via total amount and date
    const orderMatch = db
      .prepare(
        `SELECT bi.order_number
         FROM bestellung_items bi
         JOIN import_log il ON bi.import_log_id = il.id
         WHERE (
           (il.order_date IS NOT NULL AND il.order_total_cents IS NOT NULL
            AND ABS(JULIANDAY(?) - JULIANDAY(il.order_date)) <= 7
            AND ABS(il.order_total_cents - ?) <= 200)
           OR
           ((il.order_date IS NULL OR il.order_total_cents IS NULL)
            AND ABS((SELECT SUM(bi2.total_price_cents) FROM bestellung_items bi2
                     WHERE bi2.import_log_id = il.id) - ?) <= 100)
         )
         GROUP BY bi.order_number
         LIMIT 1`
      )
      .get(
        receipt.receipt_date as string,
        receipt.total_amount_cents as number,
        receipt.total_amount_cents as number
      ) as { order_number: string } | undefined

    if (orderMatch?.order_number) {
      bestellungOrderNumber = orderMatch.order_number
      const rawBestellungItems = db
        .prepare(
          `SELECT id, article_name, quantity_amount, quantity_unit, unit_price_cents, total_price_cents
           FROM bestellung_items
           WHERE order_number = ?
           ORDER BY id`
        )
        .all(bestellungOrderNumber) as Array<{
          id: number
          article_name: string
          quantity_amount: number
          quantity_unit: string
          unit_price_cents: number
          total_price_cents: number
        }>

      // Article-level matching: fuzzy-match each bestellung item to receipt items using AVIS logic
      bestellungItems = rawBestellungItems.map((bi) => {
        let bestReceiptItemId: number | null = null
        let bestScore = 0
        for (const ri of items) {
          const riRawName = ri.raw_name as string
          const riId = ri.id as number
          const score = computeMatchScore(bi.article_name, riRawName)
          if (score > bestScore && score > 35) {
            bestScore = score
            bestReceiptItemId = riId
          }
        }
        return {
          ...bi,
          matched_receipt_item_id: bestReceiptItemId,
          match_score: Math.round(bestScore),
        }
      })

      hasBestellung = bestellungItems.length > 0
    }

    const marketAliasRow = db
      .prepare(
        `SELECT alias AS market_alias, logo_path AS market_logo_path
         FROM market_aliases WHERE store_name = ?`
      )
      .get(receipt.store_name as string) as
      { market_alias: string; market_logo_path: string | null } | undefined

    let bankTransaction = null
    if (receipt.bank_transaction_id) {
      bankTransaction = db
        .prepare(
          `SELECT bt.betrag_cents, bt.buchungsdatum, bt.match_source, bt.beschreibung,
                  ta.alias, ta.logo_path
           FROM bank_transactions bt
           LEFT JOIN transaction_aliases ta ON ta.beschreibung = bt.beschreibung
           WHERE bt.id = ?`
        )
        .get(receipt.bank_transaction_id as number) as {
          betrag_cents: number
          buchungsdatum: string
          match_source: 'auto' | 'manual'
          beschreibung: string | null
          alias: string | null
          logo_path: string | null
        } | null
    }

    return NextResponse.json({
      ...receipt,
      market_alias: marketAliasRow?.market_alias ?? null,
      market_logo_path: marketAliasRow?.market_logo_path ?? null,
      items: itemsWithDiscounts,
      has_avis: hasAvis,
      has_bestellung: hasBestellung,
      bestellung_order_number: bestellungOrderNumber,
      bestellung_items: bestellungItems,
      bank_transaction: bankTransaction,
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
