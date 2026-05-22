import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import path from "path"
import fs from "fs"

function toSlug(alias: string): string {
  return alias
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const beschreibung = formData.get("beschreibung") as string | null
    const alias = (formData.get("alias") as string | null)?.trim()
    const logo = formData.get("logo") as File | null

    if (!beschreibung || !alias) {
      return NextResponse.json(
        { message: "beschreibung und alias sind erforderlich" },
        { status: 400 }
      )
    }

    let logo_path: string | null = null

    if (logo && logo.size > 0) {
      if (logo.size > 500 * 1024) {
        return NextResponse.json(
          { message: "Logo zu groß (max. 500 KB)" },
          { status: 400 }
        )
      }

      const slug = toSlug(alias)
      const ext = logo.name.toLowerCase().endsWith(".png") ? ".png" : ".jpg"
      const filename = `${slug}${ext}`
      const badgesDir = path.join(process.cwd(), "public", "badges")
      if (!fs.existsSync(badgesDir)) fs.mkdirSync(badgesDir, { recursive: true })
      const targetPath = path.join(badgesDir, filename)
      const bytes = await logo.arrayBuffer()
      fs.writeFileSync(targetPath, Buffer.from(bytes))
      logo_path = `/badges/${filename}`
    }

    const db = getDb()
    db.prepare(
      `INSERT INTO transaction_aliases (beschreibung, alias, logo_path, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(beschreibung) DO UPDATE SET
         alias = excluded.alias,
         logo_path = COALESCE(excluded.logo_path, transaction_aliases.logo_path),
         updated_at = datetime('now')`
    ).run(beschreibung, alias, logo_path)

    const saved = db
      .prepare("SELECT logo_path FROM transaction_aliases WHERE beschreibung = ?")
      .get(beschreibung) as { logo_path: string | null }

    return NextResponse.json({ success: true, logo_path: saved?.logo_path ?? null })
  } catch (e) {
    console.error("[/api/konto/transactions/alias POST] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { beschreibung } = await request.json()
    if (!beschreibung) {
      return NextResponse.json({ message: "beschreibung fehlt" }, { status: 400 })
    }

    const db = getDb()
    db.prepare("DELETE FROM transaction_aliases WHERE beschreibung = ?").run(beschreibung)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[/api/konto/transactions/alias DELETE] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
