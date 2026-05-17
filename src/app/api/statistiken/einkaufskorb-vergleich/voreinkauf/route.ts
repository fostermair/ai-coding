import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface EinkaufsverbgleichResponse {
  kann_vergleichen: boolean
  reason?: string
  letzter_einkauf?: { datum: string; gesamt_cents: number }
  vergleich?: { datum: string; typ: "voreinkauf"; gesamt_cents: number }
  vergleich_stats?: {
    differenz_cents: number
    differenz_prozent: number
    produkte_gezaehlt: number
    produkte_gesamt: number
  }
}

export async function GET(): Promise<NextResponse<EinkaufsverbgleichResponse>> {
  try {
    const db = getDb()

    // 1. Get last 2 receipts
    const receipts = db
      .prepare("SELECT id, receipt_date FROM receipts ORDER BY receipt_date DESC LIMIT 2")
      .all() as Array<{ id: number; receipt_date: string }>

    if (receipts.length < 2) {
      return NextResponse.json({
        kann_vergleichen: false,
        reason: "Nur ein Einkauf vorhanden",
      })
    }

    const [lastReceipt, previousReceipt] = receipts

    // 2. Get products from last receipt (exclude excluded_from_stats)
    const lastProducts = db
      .prepare(
        `SELECT ri.raw_name, ri.unit_price_cents
       FROM receipt_items ri
       LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
       WHERE ri.receipt_id = ?
         AND ri.unit_price_cents > 0
         AND (ri.item_type = 'product' OR ri.item_type = 'concession')
         AND COALESCE(pa.excluded_from_stats, 0) = 0`
      )
      .all(lastReceipt.id) as Array<{ raw_name: string; unit_price_cents: number }>

    if (lastProducts.length === 0) {
      return NextResponse.json({
        kann_vergleichen: false,
        reason: "Nur ein Einkauf vorhanden",
      })
    }

    const lastReceiptTotal = lastProducts.reduce((sum, p) => sum + p.unit_price_cents, 0)

    // 3. Get products from previous receipt (exclude excluded_from_stats)
    const previousProducts = db
      .prepare(
        `SELECT ri.raw_name, ri.unit_price_cents
       FROM receipt_items ri
       LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
       WHERE ri.receipt_id = ?
         AND ri.unit_price_cents > 0
         AND (ri.item_type = 'product' OR ri.item_type = 'concession')
         AND COALESCE(pa.excluded_from_stats, 0) = 0`
      )
      .all(previousReceipt.id) as Array<{ raw_name: string; unit_price_cents: number }>

    // 4. Find matching products (inner join by raw_name)
    const previousProductMap = new Map(previousProducts.map((p) => [p.raw_name, p.unit_price_cents]))
    const matchedProducts = lastProducts.filter((p) => previousProductMap.has(p.raw_name))

    if (matchedProducts.length === 0) {
      return NextResponse.json({
        kann_vergleichen: false,
        reason: "Nur ein Einkauf vorhanden",
      })
    }

    // 5. Calculate totals and statistics
    const lastMatchedTotal = matchedProducts.reduce((sum, p) => sum + p.unit_price_cents, 0)
    const previousMatchedTotal = matchedProducts.reduce((sum, p) => sum + previousProductMap.get(p.raw_name)!, 0)

    const differenzCents = lastMatchedTotal - previousMatchedTotal
    const differenzProzent =
      previousMatchedTotal > 0 ? Math.round((differenzCents / previousMatchedTotal) * 1000) / 10 : 0

    return NextResponse.json({
      kann_vergleichen: true,
      letzter_einkauf: {
        datum: lastReceipt.receipt_date,
        gesamt_cents: lastReceiptTotal,
      },
      vergleich: {
        datum: previousReceipt.receipt_date,
        typ: "voreinkauf",
        gesamt_cents: previousMatchedTotal,
      },
      vergleich_stats: {
        differenz_cents: differenzCents,
        differenz_prozent: differenzProzent,
        produkte_gezaehlt: matchedProducts.length,
        produkte_gesamt: lastProducts.length,
      },
    })
  } catch (e) {
    console.error("[/api/statistiken/einkaufskorb-vergleich/voreinkauf] Error:", e)
    return NextResponse.json(
      { kann_vergleichen: false, reason: "Interner Fehler" } as EinkaufsverbgleichResponse,
      { status: 500 }
    )
  }
}
