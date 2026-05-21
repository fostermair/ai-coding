import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function DELETE() {
  try {
    const db = getDb()

    const { count: txCount } = db
      .prepare("SELECT COUNT(*) as count FROM bank_transactions")
      .get() as { count: number }

    const { count: stmtCount } = db
      .prepare("SELECT COUNT(*) as count FROM bank_statement_log")
      .get() as { count: number }

    db.exec(`
      UPDATE receipts SET bank_transaction_id = NULL WHERE bank_transaction_id IS NOT NULL;
      DELETE FROM bank_transactions;
      DELETE FROM bank_statement_log;
    `)

    return NextResponse.json({
      message: `${txCount} Transaktionen und ${stmtCount} Kontoauszüge gelöscht.`,
      transactions: txCount,
      statements: stmtCount,
    })
  } catch (e) {
    console.error("[/api/konto/statements] DELETE error:", e)
    return NextResponse.json({ message: "Fehler beim Löschen der Kontoauszüge" }, { status: 500 })
  }
}
