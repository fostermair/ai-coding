import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const receiptId = searchParams.get("receipt_id")

    if (!receiptId) {
      return NextResponse.json({ message: "receipt_id erforderlich" }, { status: 400 })
    }

    const db = getDb()

    // Get all AVIS matches for this receipt (all statuses including 'unmatched')
    interface AvisMatchRow {
      id: number
      avis_item_name: string
      avis_unit_price_cents: number
      confidence: number
      status: string
      import_log_id: number
      receipt_item_id: number | null
    }

    const candidates = db
      .prepare(
        `SELECT id, avis_item_name, avis_unit_price_cents, confidence, status, import_log_id, receipt_item_id
         FROM avis_matches
         WHERE receipt_id = ?
         ORDER BY avis_item_name`
      )
      .all(receiptId) as AvisMatchRow[]

    // For each candidate that has a receipt_item_id, get the raw_name it's assigned to
    const candidatesWithAssignment = candidates.map((candidate) => {
      let assignedToRawName: string | null = null

      if (candidate.receipt_item_id) {
        const item = db
          .prepare("SELECT raw_name FROM receipt_items WHERE id = ?")
          .get(candidate.receipt_item_id) as { raw_name: string } | undefined
        if (item) {
          assignedToRawName = item.raw_name
        }
      }

      return {
        id: candidate.id,
        avis_item_name: candidate.avis_item_name,
        avis_unit_price_cents: candidate.avis_unit_price_cents,
        confidence: candidate.confidence,
        status: candidate.status,
        import_log_id: candidate.import_log_id,
        receipt_item_id: candidate.receipt_item_id,
        assigned_to_raw_name: assignedToRawName,
      }
    })

    // Deduplicate by avis_item_name: prefer assigned items (receipt_item_id != null),
    // then highest confidence
    interface Candidate {
      id: number
      avis_item_name: string
      avis_unit_price_cents: number
      confidence: number
      status: string
      import_log_id: number
      receipt_item_id: number | null
      assigned_to_raw_name: string | null
    }

    const byName = new Map<string, Candidate>()
    for (const c of candidatesWithAssignment) {
      const existing = byName.get(c.avis_item_name)
      if (!existing) {
        byName.set(c.avis_item_name, c)
      } else {
        // Score: prefer assigned (receipt_item_id != null), then by confidence
        const existingScore = (existing.receipt_item_id !== null ? 1000 : 0) + existing.confidence
        const newScore = (c.receipt_item_id !== null ? 1000 : 0) + c.confidence
        if (newScore > existingScore) {
          byName.set(c.avis_item_name, c)
        }
      }
    }

    const deduplicatedCandidates = Array.from(byName.values()).sort((a, b) =>
      a.avis_item_name.localeCompare(b.avis_item_name)
    )

    return NextResponse.json({ candidates: deduplicatedCandidates })
  } catch (e) {
    console.error("[/api/avis/matches/candidates] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
