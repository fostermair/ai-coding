import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const bonId = parseInt(id, 10)
    if (isNaN(bonId)) {
      return NextResponse.json({ message: "Ungültige Bon-ID" }, { status: 400 })
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

    const receipt = db
      .prepare("SELECT paperless_doc_id FROM receipts WHERE id = ?")
      .get(bonId) as { paperless_doc_id: number | null } | undefined

    if (!receipt) {
      return NextResponse.json({ message: "Bon nicht gefunden" }, { status: 404 })
    }

    if (!receipt.paperless_doc_id) {
      return NextResponse.json(
        { message: "Dieses Bon hat kein PDF" },
        { status: 404 }
      )
    }

    try {
      const pdfRes = await fetch(
        `${baseUrl}/api/documents/${receipt.paperless_doc_id}/download/`,
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
    console.error("[/api/bons/[id]/pdf] GET Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
