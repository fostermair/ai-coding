import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function DELETE(_request: NextRequest) {
  try {
    const db = getDb()

    // Find all AVIS import_log IDs (filename starts with [AVIS])
    interface ImportLog {
      id: number
    }
    const avisLogs = db
      .prepare("SELECT id FROM import_log WHERE filename LIKE '[AVIS]%'")
      .all() as ImportLog[]

    if (avisLogs.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "Keine AVIS-Daten zum Löschen vorhanden",
      })
    }

    const logIds = avisLogs.map((log) => log.id)

    // Transaction: delete in correct order
    const transaction = db.transaction(() => {
      // 1. Delete avis_matches for these import_logs
      const placeholders = logIds.map(() => "?").join(",")
      db.prepare(`DELETE FROM avis_matches WHERE import_log_id IN (${placeholders})`).run(...logIds)

      // 2. Delete product_aliases that were auto-set (no match_source from AVIS or global)
      // These are aliases where no manual assignment was made yet
      // We keep aliases that have match_source = 'avis_document' or 'global_database'
      // But we delete those where the source was auto_set (no match_source)
      db.prepare(
        `DELETE FROM product_aliases
         WHERE raw_name IN (
           SELECT DISTINCT pa.raw_name FROM product_aliases pa
           WHERE NOT EXISTS (
             SELECT 1 FROM avis_matches am
             WHERE am.avis_item_name = pa.alias
             AND am.match_source IN ('avis_document', 'global_database')
           )
         )`
      ).run()

      // 3. Delete import_log entries
      db.prepare(`DELETE FROM import_log WHERE id IN (${placeholders})`).run(...logIds)
    })

    transaction()

    return NextResponse.json({
      success: true,
      count: logIds.length,
      message: `AVIS-Datenbank gelöscht. ${logIds.length} Imports entfernt.`,
    })
  } catch (e) {
    console.error("[/api/avis/db] DELETE Error:", e)
    return NextResponse.json(
      { success: false, message: "Fehler beim Löschen der AVIS-Datenbank aufgetreten" },
      { status: 500 }
    )
  }
}
