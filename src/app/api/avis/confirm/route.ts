import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { z } from "zod"

const ConfirmSchema = z.object({
  import_log_id: z.string().min(1),
  confirmed_matches: z.array(
    z.object({
      ebonRawName: z.string().min(1),
      avisName: z.string().min(1),
    })
  ),
  rejected_matches: z.array(
    z.object({
      ebonRawName: z.string().min(1),
      avisName: z.string().min(1),
    })
  ),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = ConfirmSchema.parse(body)

    const db = getDb()

    // Set aliases for confirmed matches (only if alias is empty)
    const setAliasStmt = db.prepare(
      "INSERT OR IGNORE INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))"
    )

    const transaction = db.transaction(() => {
      for (const match of validated.confirmed_matches) {
        // Only set if alias is empty
        const existing = db
          .prepare("SELECT alias FROM product_aliases WHERE raw_name = ?")
          .get(match.ebonRawName) as { alias: string } | undefined

        if (!existing || !existing.alias) {
          setAliasStmt.run(match.ebonRawName, match.avisName)
        }
      }

      // Note: rejected matches are not stored anywhere, they're just not applied
      // Update import log with final count
      const confirmedCount = validated.confirmed_matches.length
      const updateLog = db.prepare(
        "UPDATE import_log SET message = message || ? WHERE id = ?"
      )
      updateLog.run(` · ${confirmedCount} durch Nutzer bestätigt`, validated.import_log_id)
    })

    transaction()

    return NextResponse.json({
      message: `${validated.confirmed_matches.length} Zuordnung(en) gespeichert`,
      confirmed: validated.confirmed_matches.length,
      rejected: validated.rejected_matches.length,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ message: "Ungültige Anfrage" }, { status: 400 })
    }
    console.error("[/api/avis/confirm] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
