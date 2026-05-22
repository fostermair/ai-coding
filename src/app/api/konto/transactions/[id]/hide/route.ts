import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const txId = parseInt(id)
    if (isNaN(txId)) {
      return NextResponse.json({ message: "Ungültige Transaktions-ID" }, { status: 400 })
    }

    const db = getDb()

    const tx = db
      .prepare("SELECT hidden FROM bank_transactions WHERE id = ?")
      .get(txId) as { hidden: number } | undefined

    if (!tx) {
      return NextResponse.json({ message: "Transaktion nicht gefunden" }, { status: 404 })
    }

    const newHidden = tx.hidden === 0 ? 1 : 0
    db.prepare("UPDATE bank_transactions SET hidden = ? WHERE id = ?").run(newHidden, txId)

    return NextResponse.json({ success: true, hidden: newHidden })
  } catch (e) {
    console.error("[/api/konto/transactions/[id]/hide PATCH] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
