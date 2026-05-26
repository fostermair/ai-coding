import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function DELETE() {
  const db = getDb()

  const ids = db
    .prepare("SELECT DISTINCT import_log_id FROM bestellung_items")
    .all() as { import_log_id: number }[]

  if (ids.length === 0) {
    return NextResponse.json({
      message: "Keine Bestellungs-Daten zum Löschen vorhanden",
      deleted: 0,
    })
  }

  const count = ids.length
  const placeholders = ids.map(() => "?").join(",")
  const idValues = ids.map((r) => r.import_log_id)

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM bestellung_items").run()
    db.prepare(`DELETE FROM import_log WHERE id IN (${placeholders})`).run(...idValues)
  })

  transaction()

  return NextResponse.json({
    message: `${count} Bestellung(en) gelöscht`,
    deleted: count,
  })
}
