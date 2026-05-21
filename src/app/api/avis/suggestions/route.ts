import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { computeMatchScore, FILTER_MATCHED_AVIS_ITEMS } from "@/lib/avis-matching"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const rawName = searchParams.get("raw_name")
    const searchText = searchParams.get("search")
    const limitStr = searchParams.get("limit")
    const limit = limitStr ? Math.min(parseInt(limitStr, 10), 100) : 1

    if (!rawName || rawName.trim().length === 0) {
      return NextResponse.json({ message: "raw_name erforderlich" }, { status: 400 })
    }

    const db = getDb()

    // Get all unique AVIS item names from the entire avis_matches table
    interface AvisItemRow {
      avis_item_name: string
    }

    // Apply text filter if search parameter provided
    let query = `SELECT DISTINCT avis_item_name FROM avis_matches WHERE ${FILTER_MATCHED_AVIS_ITEMS}`
    const params: (string | number)[] = []

    if (searchText && searchText.trim().length > 0) {
      query += ` AND avis_item_name LIKE ?`
      params.push(`%${searchText}%`)
    }

    query += ` ORDER BY avis_item_name`

    const allAvisItems = db.prepare(query).all(...params) as AvisItemRow[]

    // Compute fuzzy match scores for each item
    const scored = allAvisItems.map((item) => ({
      ...item,
      score: computeMatchScore(item.avis_item_name, rawName),
    }))

    // Sort by score descending, then by name
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.avis_item_name.localeCompare(b.avis_item_name)
    })

    // Take top results
    const suggestions = scored
      .slice(0, limit)
      .map((item) => ({
        avis_item_name: item.avis_item_name,
        score: Math.round(item.score),
      }))

    return NextResponse.json({ suggestions })
  } catch (e) {
    console.error("[/api/avis/suggestions] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
