import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const txId = parseInt(id)
    if (isNaN(txId)) {
      return NextResponse.json({ message: "Ungültige Transaktions-ID" }, { status: 400 })
    }

    const body = await request.json()
    const receipt_id = body?.receipt_id
    if (!receipt_id || typeof receipt_id !== 'number') {
      return NextResponse.json({ message: "receipt_id fehlt" }, { status: 400 })
    }

    const db = getDb()

    // Verify transaction exists
    const tx = db.prepare("SELECT id, match_status, matched_receipt_id FROM bank_transactions WHERE id = ?").get(txId) as
      | { id: number; match_status: string; matched_receipt_id: number | null }
      | undefined
    if (!tx) {
      return NextResponse.json({ message: "Transaktion nicht gefunden" }, { status: 404 })
    }

    // Verify receipt exists and is not already linked to another transaction
    const receipt = db.prepare("SELECT id, bank_transaction_id FROM receipts WHERE id = ? AND is_virtual = 0").get(receipt_id) as
      | { id: number; bank_transaction_id: number | null }
      | undefined
    if (!receipt) {
      return NextResponse.json({ message: "Bon nicht gefunden" }, { status: 404 })
    }
    if (receipt.bank_transaction_id && receipt.bank_transaction_id !== txId) {
      return NextResponse.json({ message: "Bon ist bereits einer anderen Transaktion zugeordnet" }, { status: 409 })
    }

    db.transaction(() => {
      // Delete old virtual bon if tx was virtual — clear FK ref first to avoid constraint violation
      if (tx.match_status === 'virtual' && tx.matched_receipt_id) {
        db.prepare("UPDATE bank_transactions SET matched_receipt_id = NULL WHERE id = ?").run(txId)
        db.prepare("DELETE FROM receipts WHERE id = ? AND is_virtual = 1").run(tx.matched_receipt_id)
      }

      // Assign
      db.prepare(
        `UPDATE bank_transactions SET match_status = 'matched', matched_receipt_id = ?, match_source = 'manual' WHERE id = ?`
      ).run(receipt_id, txId)

      db.prepare("UPDATE receipts SET bank_transaction_id = ? WHERE id = ?").run(txId, receipt_id)
    })()

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[/api/konto/transactions/[id]/assign] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const txId = parseInt(id)
    if (isNaN(txId)) {
      return NextResponse.json({ message: "Ungültige Transaktions-ID" }, { status: 400 })
    }

    const db = getDb()

    const tx = db.prepare("SELECT id, matched_receipt_id FROM bank_transactions WHERE id = ?").get(txId) as
      | { id: number; matched_receipt_id: number | null }
      | undefined
    if (!tx) {
      return NextResponse.json({ message: "Transaktion nicht gefunden" }, { status: 404 })
    }

    db.transaction(() => {
      // Unlink receipt
      if (tx.matched_receipt_id) {
        db.prepare("UPDATE receipts SET bank_transaction_id = NULL WHERE id = ? AND is_virtual = 0").run(tx.matched_receipt_id)
      }

      db.prepare(
        `UPDATE bank_transactions SET match_status = 'unmatched', matched_receipt_id = NULL, match_source = NULL WHERE id = ?`
      ).run(txId)
    })()

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[/api/konto/transactions/[id]/assign DELETE] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
