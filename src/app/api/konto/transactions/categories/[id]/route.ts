import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getDb } from "@/lib/db"

const bodySchema = z.object({
  muster: z.string().min(1, "Muster darf nicht leer sein"),
  kategorie: z.string().min(1, "Kategorie darf nicht leer sein"),
  farbe: z.string().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = Number(id)
    if (!Number.isInteger(numId) || numId <= 0) {
      return NextResponse.json({ message: "Ungültige ID" }, { status: 400 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      )
    }
    const { muster, kategorie, farbe } = parsed.data

    const db = getDb()
    try {
      // Get the current kategorie name before updating (to propagate farbe to siblings)
      const current = db.prepare("SELECT kategorie FROM transaction_categories WHERE id = ?").get(numId) as { kategorie: string } | undefined

      const result = farbe
        ? db.prepare(`UPDATE transaction_categories SET muster = ?, kategorie = ?, farbe = ? WHERE id = ?`).run(muster, kategorie, farbe, numId)
        : db.prepare(`UPDATE transaction_categories SET muster = ?, kategorie = ? WHERE id = ?`).run(muster, kategorie, numId)

      // Propagate farbe to all other rules with the same kategorie name
      if (farbe && current) {
        db.prepare(`UPDATE transaction_categories SET farbe = ? WHERE kategorie = ? AND id != ?`)
          .run(farbe, current.kategorie, numId)
        // Also update if kategorie name was changed — apply farbe to new name siblings
        if (kategorie !== current.kategorie) {
          db.prepare(`UPDATE transaction_categories SET farbe = ? WHERE kategorie = ? AND id != ?`)
            .run(farbe, kategorie, numId)
        }
      }

      if (result.changes === 0) {
        return NextResponse.json({ message: "Regel nicht gefunden" }, { status: 404 })
      }

      const row = db
        .prepare("SELECT id, muster, kategorie, farbe, created_at FROM transaction_categories WHERE id = ?")
        .get(numId)

      return NextResponse.json({ category: row })
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
    console.error("[/api/konto/transactions/categories/[id] PUT] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = Number(id)
    if (!Number.isInteger(numId) || numId <= 0) {
      return NextResponse.json({ message: "Ungültige ID" }, { status: 400 })
    }

    const db = getDb()
    const result = db
      .prepare("DELETE FROM transaction_categories WHERE id = ?")
      .run(numId)

    if (result.changes === 0) {
      return NextResponse.json({ message: "Regel nicht gefunden" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[/api/konto/transactions/categories/[id] DELETE] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
