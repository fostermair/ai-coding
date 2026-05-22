import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import path from "path"
import { mkdir, writeFile } from "fs/promises"

function toSlug(alias: string): string {
  return alias
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function extFromMime(mime: string, name: string): ".png" | ".jpg" {
  if (mime === "image/png") return ".png"
  if (mime === "image/jpeg") return ".jpg"
  return name.toLowerCase().endsWith(".png") ? ".png" : ".jpg"
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const store_name = formData.get("store_name") as string | null
    const alias = (formData.get("alias") as string | null)?.trim()
    const logo = formData.get("logo") as File | null

    if (!store_name || !alias) {
      return NextResponse.json(
        { message: "store_name und alias sind erforderlich" },
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

      const filename = `${toSlug(alias)}${extFromMime(logo.type, logo.name)}`
      const badgesDir = path.join(process.cwd(), "public", "badges")
      await mkdir(badgesDir, { recursive: true })
      await writeFile(path.join(badgesDir, filename), Buffer.from(await logo.arrayBuffer()))
      logo_path = `/badges/${filename}`
    }

    const db = getDb()
    const row = db
      .prepare(
        `INSERT INTO market_aliases (store_name, alias, logo_path, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(store_name) DO UPDATE SET
           alias = excluded.alias,
           logo_path = COALESCE(excluded.logo_path, market_aliases.logo_path),
           updated_at = datetime('now')
         RETURNING logo_path`
      )
      .get(store_name, alias, logo_path) as { logo_path: string | null } | undefined

    return NextResponse.json({ success: true, logo_path: row?.logo_path ?? null })
  } catch (e) {
    console.error("[/api/bons/market-alias POST] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { store_name } = await request.json()
    if (!store_name) {
      return NextResponse.json({ message: "store_name fehlt" }, { status: 400 })
    }

    const db = getDb()
    db.prepare("DELETE FROM market_aliases WHERE store_name = ?").run(store_name)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[/api/bons/market-alias DELETE] Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
