import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const txId = parseInt(id)
    if (isNaN(txId)) {
      return NextResponse.json({ message: "Ungültige Transaktions-ID" }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.hidden !== "boolean") {
      return NextResponse.json({ message: "{ hidden: boolean } erforderlich" }, { status: 400 })
    }
    const hiddenValue = body.hidden ? 1 : 0

    const db = getDb()
    const result = db
      .prepare("UPDATE bank_transactions SET hidden = ? WHERE id = ?")
      .run(hiddenValue, txId)

    if (result.changes === 0) {
      return NextResponse.json({ message: "Transaktion nicht gefunden" }, { status: 404 })
    }

    return NextResponse.json({ success: true, hidden: hiddenValue })
  } catch (e) {
    console.error("[/api/konto/transactions/[id]/hide PATCH] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
