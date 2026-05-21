import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { receipt_item_id, receipt_id, avis_item_name, match_source, existing_match_id } = body

    // Validation
    if (!receipt_item_id || !receipt_id || !avis_item_name || !match_source) {
      return NextResponse.json(
        { message: "receipt_item_id, receipt_id, avis_item_name, and match_source erforderlich" },
        { status: 400 }
      )
    }

    if (!["avis_document", "global_database"].includes(match_source)) {
      return NextResponse.json(
        { message: "match_source muss 'avis_document' oder 'global_database' sein" },
        { status: 400 }
      )
    }

    const db = getDb()

    // Get the receipt_item to get the raw_name
    interface ReceiptItem {
      raw_name: string
    }
    const item = db
      .prepare("SELECT raw_name FROM receipt_items WHERE id = ?")
      .get(receipt_item_id) as ReceiptItem | undefined

    if (!item) {
      return NextResponse.json({ message: "Artikel nicht gefunden" }, { status: 404 })
    }

    // Transaction to handle all updates
    const transaction = db.transaction(() => {
      let matchId = existing_match_id

      if (existing_match_id) {
        // Update existing match if it was rejected
        const existingMatch = db
          .prepare("SELECT status FROM avis_matches WHERE id = ?")
          .get(existing_match_id) as { status: string } | undefined

        if (!existingMatch) {
          throw new Error("Bestehender Match nicht gefunden")
        }

        if (existingMatch.status === "rejected") {
          db.prepare(
            `UPDATE avis_matches
             SET status = 'confirmed', match_source = ?, updated_at = datetime('now')
             WHERE id = ?`
          ).run(match_source, existing_match_id)
        } else {
          // Match exists but is not rejected - cannot update in-place
          // Let the transaction fail so the caller can handle it
          throw new Error(`Match status ist '${existingMatch.status}', kann nur 'rejected' aktualisiert werden`)
        }
      } else {
        // Create a new avis_matches entry
        // First, find an unmatched AVIS item with the same name, or create one
        const existingAvisMatch = db
          .prepare(
            `SELECT id, import_log_id FROM avis_matches
             WHERE receipt_id = ? AND avis_item_name = ? AND status IN ('unmatched', 'pending')
             LIMIT 1`
          )
          .get(receipt_id, avis_item_name) as { id: number; import_log_id: number } | undefined

        if (existingAvisMatch) {
          // Use existing unmatched/pending match
          matchId = existingAvisMatch.id
          db.prepare(
            `UPDATE avis_matches
             SET receipt_item_id = ?, status = 'confirmed', match_source = ?, updated_at = datetime('now')
             WHERE id = ?`
          ).run(receipt_item_id, match_source, matchId)
        } else {
          // Create a new entry - need to find the import_log_id
          const lastImport = db
            .prepare(
              `SELECT import_log_id FROM avis_matches
               WHERE receipt_id = ?
               ORDER BY import_log_id DESC
               LIMIT 1`
            )
            .get(receipt_id) as { import_log_id: number } | undefined

          if (!lastImport) {
            throw new Error("Kein Import-Log für diesen Bon gefunden")
          }

          const insertResult = db
            .prepare(
              `INSERT INTO avis_matches
               (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status, match_source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              receipt_id,
              receipt_item_id,
              lastImport.import_log_id,
              avis_item_name,
              0, // price unknown for manual assignments
              100, // confidence is high for manual assignments
              "confirmed",
              match_source
            )

          matchId = insertResult.lastInsertRowid as number
        }
      }

      // Save the alias mapping
      db.prepare(
        `INSERT INTO product_aliases (raw_name, alias, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(raw_name) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at`
      ).run(item.raw_name, avis_item_name)

      return matchId
    })

    const matchId = transaction()

    return NextResponse.json({
      success: true,
      match_id: matchId,
      message: "Manuelle Zuweisung gespeichert",
    })
  } catch (e) {
    console.error("[/api/avis/matches/manual-assign] Error:", e)
    const message = e instanceof Error ? e.message : "Interner Fehler"
    // Return 409 Conflict for state-related errors, 500 for others
    const status = message.includes("Match status") ? 409 : 500
    return NextResponse.json({ message }, { status })
  }
}
