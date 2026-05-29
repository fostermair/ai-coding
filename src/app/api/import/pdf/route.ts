import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import { getDb } from "@/lib/db"

async function fetchFromPaperless(docId: number): Promise<NextResponse> {
  const baseUrl = process.env.PAPERLESS_URL
  const token = process.env.PAPERLESS_TOKEN

  if (!baseUrl || !token) {
    return NextResponse.json({ error: "Paperless nicht konfiguriert" }, { status: 503 })
  }

  try {
    const res = await fetch(`${baseUrl}/api/documents/${docId}/download/`, {
      headers: { Authorization: `Token ${token}` },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `PDF-Download fehlgeschlagen (${res.status})` },
        { status: 502 }
      )
    }
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch {
    return NextResponse.json({ error: "Paperless nicht erreichbar" }, { status: 503 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const type = searchParams.get("type")
    const idStr = searchParams.get("id")
    const id = idStr ? parseInt(idStr, 10) : NaN

    if (!type || isNaN(id)) {
      return NextResponse.json({ error: "Ungültige Parameter" }, { status: 400 })
    }

    const db = getDb()

    if (type === "ebon") {
      const row = db
        .prepare("SELECT paperless_doc_id FROM receipts WHERE id = ?")
        .get(id) as { paperless_doc_id: number | null } | undefined
      if (!row?.paperless_doc_id) {
        return NextResponse.json({ error: "Kein PDF verfügbar" }, { status: 404 })
      }
      return fetchFromPaperless(row.paperless_doc_id)
    }

    if (type === "avis" || type === "bestellung") {
      const row = db
        .prepare("SELECT pdf_path, paperless_doc_id FROM import_log WHERE id = ?")
        .get(id) as { pdf_path: string | null; paperless_doc_id: number | null } | undefined
      if (!row) {
        return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 })
      }
      if (row.pdf_path && fs.existsSync(row.pdf_path)) {
        const buffer = fs.readFileSync(row.pdf_path)
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        })
      }
      if (row.paperless_doc_id) {
        return fetchFromPaperless(row.paperless_doc_id)
      }
      return NextResponse.json({ error: "Kein PDF verfügbar" }, { status: 404 })
    }

    if (type === "kontoauszug") {
      const row = db
        .prepare("SELECT paperless_doc_id FROM bank_statement_log WHERE id = ?")
        .get(id) as { paperless_doc_id: number | null } | undefined
      if (!row?.paperless_doc_id) {
        return NextResponse.json({ error: "Kein PDF verfügbar" }, { status: 404 })
      }
      return fetchFromPaperless(row.paperless_doc_id)
    }

    return NextResponse.json({ error: "Unbekannter Typ" }, { status: 400 })
  } catch (e) {
    console.error("[/api/import/pdf] GET Error:", e)
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 })
  }
}
