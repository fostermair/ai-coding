import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ periode: string }> }
) {
  try {
    const { periode } = await params
    if (!periode || !/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ message: "Ungültiges Perioden-Format (YYYY-MM erwartet)" }, { status: 400 })
    }

    const baseUrl = process.env.PAPERLESS_URL
    const token = process.env.PAPERLESS_TOKEN

    if (!baseUrl || !token) {
      return NextResponse.json(
        { message: "Paperless nicht konfiguriert" },
        { status: 503 }
      )
    }

    const db = getDb()

    const statement = db
      .prepare("SELECT paperless_doc_id FROM bank_statement_log WHERE periode = ? LIMIT 1")
      .get(periode) as { paperless_doc_id: number | null } | undefined

    if (!statement) {
      return NextResponse.json({ message: "Kontoauszug nicht gefunden" }, { status: 404 })
    }

    if (!statement.paperless_doc_id) {
      return NextResponse.json(
        { message: "Diesen Kontoauszug hat kein PDF" },
        { status: 404 }
      )
    }

    try {
      const pdfRes = await fetch(
        `${baseUrl}/api/documents/${statement.paperless_doc_id}/download/`,
        { headers: { Authorization: `Token ${token}` } }
      )

      if (!pdfRes.ok) {
        return NextResponse.json(
          { message: `PDF-Download fehlgeschlagen (${pdfRes.status})` },
          { status: 502 }
        )
      }

      const pdfBuffer = await pdfRes.arrayBuffer()

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      })
    } catch {
      return NextResponse.json(
        { message: "Paperless nicht erreichbar" },
        { status: 503 }
      )
    }
  } catch (e) {
    console.error("[/api/konto/statements/[periode]/pdf] GET Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
