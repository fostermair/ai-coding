import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function DELETE() {
  try {
    const db = getDb()

    const { count: receiptCount } = db
      .prepare("SELECT COUNT(*) as count FROM receipts")
      .get() as { count: number }

    // Circular FK: receipts.bank_transaction_id ↔ bank_transactions.matched_receipt_id
    // Both must be NULLed before either table can be cleared.
    db.exec(`
      UPDATE bank_transactions SET matched_receipt_id = NULL WHERE matched_receipt_id IS NOT NULL;
      UPDATE receipts SET bank_transaction_id = NULL WHERE bank_transaction_id IS NOT NULL;
      DELETE FROM avis_matches;
      DELETE FROM item_discounts;
      DELETE FROM receipt_items;
      DELETE FROM receipts;
      DELETE FROM product_aliases;
      DELETE FROM import_log;
    `)

    return NextResponse.json({
      message: `${receiptCount} Bons und alle zugehörigen Daten gelöscht.`,
      receipts: receiptCount,
    })
  } catch (e) {
    console.error("[/api/bons/reset] DELETE error:", e)
    return NextResponse.json({ message: "Fehler beim Löschen der Bons-Datenbank" }, { status: 500 })
  }
}
