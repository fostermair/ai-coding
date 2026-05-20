import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { computeMatchScore } from "@/lib/avis-matching"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const rawName = searchParams.get("raw_name")

    if (!rawName || rawName.trim().length === 0) {
      return NextResponse.json({ message: "raw_name erforderlich" }, { status: 400 })
    }

    const db = getDb()

    // Get all unique AVIS item names from the entire avis_matches table
    interface AvisItemRow {
      avis_item_name: string
      receipt_id: number
      import_log_id: number
    }

    const allAvisItems = db
      .prepare(
        `SELECT DISTINCT avis_item_name, receipt_id, import_log_id
         FROM avis_matches
         ORDER BY avis_item_name`
      )
      .all() as AvisItemRow[]

    // Compute fuzzy match scores for each item
    let bestScore = 0
    let bestMatch: AvisItemRow | null = null

    for (const item of allAvisItems) {
      const score = computeMatchScore(item.avis_item_name, rawName)
      if (score > bestScore) {
        bestScore = score
        bestMatch = item
      }
    }

    // Only return a suggestion if score is >= 60
    if (bestMatch && bestScore >= 60) {
      return NextResponse.json({
        suggestion: {
          avis_item_name: bestMatch.avis_item_name,
          score: Math.round(bestScore),
          receipt_id: bestMatch.receipt_id,
          import_log_id: bestMatch.import_log_id,
        },
      })
    }

    // No good match found
    return NextResponse.json({ suggestion: null })
  } catch (e) {
    console.error("[/api/avis/suggestions] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
