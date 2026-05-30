import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface ReferenzwertRow {
  year: number
  official_rate_percent: number | null
}

export async function GET(): Promise<NextResponse<{ rows: ReferenzwertRow[] }>> {
  try {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT year, official_rate_percent
         FROM inflation_reference_values
         ORDER BY year DESC`
      )
      .all() as ReferenzwertRow[]
    return NextResponse.json({ rows })
  } catch (e) {
    console.error("[/api/statistiken/inflations-index/referenzwerte GET]", e)
    return NextResponse.json({ rows: [] }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse<{ ok: boolean }>> {
  try {
    const body = (await request.json()) as { year: number; official_rate_percent: number | null }
    const { year, official_rate_percent } = body

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ ok: false } as { ok: boolean }, { status: 400 })
    }

    const db = getDb()
    db.prepare(
      `INSERT INTO inflation_reference_values (year, official_rate_percent)
       VALUES (?, ?)
       ON CONFLICT(year) DO UPDATE SET official_rate_percent = excluded.official_rate_percent`
    ).run(year, official_rate_percent)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/statistiken/inflations-index/referenzwerte PUT]", e)
    return NextResponse.json({ ok: false } as { ok: boolean }, { status: 500 })
  }
}
