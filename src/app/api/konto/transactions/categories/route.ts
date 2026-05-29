import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getDb } from "@/lib/db"

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899',
  '#14b8a6', '#a855f7',
]

const bodySchema = z.object({
  muster: z.string().min(1, "Muster darf nicht leer sein"),
  kategorie: z.string().min(1, "Kategorie darf nicht leer sein"),
  farbe: z.string().optional(),
})

export async function GET() {
  try {
    const db = getDb()
    const categories = db
      .prepare("SELECT id, muster, kategorie, farbe, created_at FROM transaction_categories ORDER BY id ASC")
      .all()
    return NextResponse.json({ categories })
  } catch (e) {
    console.error("[/api/konto/transactions/categories GET] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      )
    }
    const { muster, kategorie, farbe: farbeInput } = parsed.data

    const db = getDb()

    // Auto-pick color from palette based on existing count if none provided
    let farbe = farbeInput
    if (!farbe) {
      const count = (db.prepare("SELECT COUNT(*) as n FROM transaction_categories").get() as { n: number }).n
      farbe = PALETTE[count % PALETTE.length]
    }

    try {
      const row = db
        .prepare(
          `INSERT INTO transaction_categories (muster, kategorie, farbe, created_at)
           VALUES (?, ?, ?, datetime('now'))
           RETURNING id, muster, kategorie, farbe, created_at`
        )
        .get(muster, kategorie, farbe) as Record<string, unknown>
      return NextResponse.json({ category: row }, { status: 201 })
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
        return NextResponse.json(
          { message: `Muster „${muster}" existiert bereits` },
          { status: 409 }
        )
      }
      throw err
    }
  } catch (e) {
    console.error("[/api/konto/transactions/categories POST] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
