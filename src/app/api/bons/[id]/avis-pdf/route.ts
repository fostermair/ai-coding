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

    // Find the best AVIS match (highest confidence) for this receipt
    const bestMatch = db
      .prepare(
        `SELECT il.paperless_doc_id
         FROM avis_matches am
         INNER JOIN import_log il ON am.import_log_id = il.id
         WHERE am.receipt_id = ?
         ORDER BY am.confidence DESC
         LIMIT 1`
      )
      .get(bonId) as { paperless_doc_id: number | null } | undefined

    if (!bestMatch || !bestMatch.paperless_doc_id) {
      return NextResponse.json(
        { message: "Kein AVIS-PDF für diesen Bon verfügbar" },
        { status: 404 }
      )
    }

    try {
      const pdfRes = await fetch(
        `${baseUrl}/api/documents/${bestMatch.paperless_doc_id}/download/`,
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
    console.error("[/api/bons/[id]/avis-pdf] GET Error:", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
