import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import { getDb } from "@/lib/db"
import { rematchAfterBonImport } from "@/lib/konto-matching"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, id } = body as { type: string; id: number }

    if (!type || !id || !["ebon", "avis", "bestellung", "kontoauszug"].includes(type)) {
      return NextResponse.json({ error: "Ungültige Parameter" }, { status: 400 })
    }

    const db = getDb()

    // ── eBon: Re-trigger bank matching ──────────────────────────────────────
    if (type === "ebon") {
      const receipt = db
        .prepare(
          "SELECT id, receipt_date, total_amount_cents, store_chain FROM receipts WHERE id = ? AND is_virtual = 0"
        )
        .get(id) as {
          id: number
          receipt_date: string
          total_amount_cents: number
          store_chain: string
        } | undefined

      if (!receipt) {
        return NextResponse.json({ error: "eBon nicht gefunden" }, { status: 404 })
      }

      rematchAfterBonImport(
        db,
        receipt.id,
        receipt.receipt_date,
        receipt.total_amount_cents,
        receipt.store_chain
      )

      const updated = db
        .prepare("SELECT bank_transaction_id FROM receipts WHERE id = ?")
        .get(id) as { bank_transaction_id: number | null } | undefined

      return NextResponse.json({ success: true, matched: !!(updated?.bank_transaction_id) })
    }

    // ── AVIS: Fetch PDF, delete old, re-import ──────────────────────────────
    if (type === "avis") {
      const log = db
        .prepare("SELECT id, pdf_path, paperless_doc_id FROM import_log WHERE id = ? AND source_type = 'avis'")
        .get(id) as { id: number; pdf_path: string | null; paperless_doc_id: number | null } | undefined

      if (!log) return NextResponse.json({ error: "AVIS-Import nicht gefunden" }, { status: 404 })

      // Fetch PDF before deleting (endpoint reads from import_log)
      const pdfBuffer = await fetchPdfBuffer(request, "avis", id, log.pdf_path, log.paperless_doc_id)
      if (!pdfBuffer) {
        return NextResponse.json({ error: "PDF nicht verfügbar — nur Paperless-Importe können neu importiert werden", canReimport: false }, { status: 422 })
      }

      // Delete old records (avis_matches will be cascade deleted via import_log FK? No — avis_matches has import_log_id as FK)
      db.prepare("DELETE FROM avis_matches WHERE import_log_id = ?").run(id)
      db.prepare("DELETE FROM import_log WHERE id = ?").run(id)

      // Re-import via existing AVIS endpoint
      const baseUrl = getBaseUrl(request)
      const formData = new FormData()
      formData.append("file", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), "reimport.pdf")
      const res = await fetch(`${baseUrl}/api/avis/import`, { method: "POST", body: formData })
      const json = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: json.message ?? "Fehler beim Re-Import" }, { status: res.status })
      }
      return NextResponse.json({ success: true, ...json })
    }

    // ── Bestellung: Read local PDF, delete old, re-import ──────────────────
    if (type === "bestellung") {
      const log = db
        .prepare("SELECT id, pdf_path, paperless_doc_id FROM import_log WHERE id = ? AND source_type = 'bestellung'")
        .get(id) as { id: number; pdf_path: string | null; paperless_doc_id: number | null } | undefined

      if (!log) return NextResponse.json({ error: "Bestellungs-Import nicht gefunden" }, { status: 404 })

      const pdfBuffer = await fetchPdfBuffer(request, "bestellung", id, log.pdf_path, log.paperless_doc_id)
      if (!pdfBuffer) {
        return NextResponse.json({ error: "PDF nicht verfügbar", canReimport: false }, { status: 422 })
      }

      // Delete old records (bestellung_items cascade via ON DELETE CASCADE FK)
      db.prepare("DELETE FROM import_log WHERE id = ?").run(id)

      // Re-import via existing Bestellung endpoint
      const baseUrl = getBaseUrl(request)
      const formData = new FormData()
      formData.append("file", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), "reimport.pdf")
      const res = await fetch(`${baseUrl}/api/bestellung/import`, { method: "POST", body: formData })
      const json = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: json.message ?? "Fehler beim Re-Import" }, { status: res.status })
      }
      return NextResponse.json({ success: true, ...json })
    }

    // ── Kontoauszug: Fetch from Paperless, delete old, re-import ────────────
    if (type === "kontoauszug") {
      const stmt = db
        .prepare("SELECT id, konto_iban, periode, paperless_doc_id, dateiname FROM bank_statement_log WHERE id = ?")
        .get(id) as { id: number; konto_iban: string; periode: string; paperless_doc_id: number | null; dateiname: string | null } | undefined

      if (!stmt) return NextResponse.json({ error: "Kontoauszug nicht gefunden" }, { status: 404 })

      if (!stmt.paperless_doc_id) {
        return NextResponse.json(
          { error: "Nur Paperless-Importe können neu importiert werden", canReimport: false },
          { status: 422 }
        )
      }

      // Fetch PDF before deleting (uses bank_statement_log.paperless_doc_id)
      const baseUrl = getBaseUrl(request)
      const pdfRes = await fetch(`${baseUrl}/api/import/pdf?type=kontoauszug&id=${id}`)
      if (!pdfRes.ok) {
        return NextResponse.json({ error: "PDF konnte nicht von Paperless geladen werden" }, { status: 502 })
      }
      const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())

      // Remember which transactions were hidden so we can restore that state after re-import
      const hiddenTxs = db.prepare(
        "SELECT buchungsdatum, betrag_cents, beschreibung FROM bank_transactions WHERE konto_iban = ? AND periode = ? AND hidden = 1"
      ).all(stmt.konto_iban, stmt.periode) as Array<{ buchungsdatum: string; betrag_cents: number; beschreibung: string }>

      // Unlink receipts whose matched bank_transaction references a transaction from this statement
      db.prepare(`
        UPDATE receipts
        SET bank_transaction_id = NULL
        WHERE bank_transaction_id IN (
          SELECT id FROM bank_transactions WHERE konto_iban = ? AND periode = ?
        )
      `).run(stmt.konto_iban, stmt.periode)

      // Delete transactions for this statement period
      db.prepare("DELETE FROM bank_transactions WHERE konto_iban = ? AND periode = ?")
        .run(stmt.konto_iban, stmt.periode)

      // Delete the statement log entry (breaks unique constraint so re-import can insert)
      db.prepare("DELETE FROM bank_statement_log WHERE id = ?").run(id)

      // Re-import via existing Kontoauszug endpoint
      const formData = new FormData()
      formData.append("file", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), "reimport.pdf")
      const res = await fetch(`${baseUrl}/api/konto/import`, { method: "POST", body: formData })
      const json = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: json.message ?? "Fehler beim Re-Import" }, { status: res.status })
      }

      // Restore original paperless_doc_id and filename (konto/import doesn't know these)
      db.prepare(
        "UPDATE bank_statement_log SET paperless_doc_id = ?, dateiname = ? WHERE konto_iban = ? AND periode = ?"
      ).run(stmt.paperless_doc_id, stmt.dateiname, stmt.konto_iban, stmt.periode)

      // Restore hidden state for previously-hidden transactions
      for (const tx of hiddenTxs) {
        db.prepare(
          "UPDATE bank_transactions SET hidden = 1 WHERE konto_iban = ? AND buchungsdatum = ? AND betrag_cents = ? AND beschreibung = ?"
        ).run(stmt.konto_iban, tx.buchungsdatum, tx.betrag_cents, tx.beschreibung)
      }

      return NextResponse.json({ success: true, ...json })
    }

    return NextResponse.json({ error: "Unbekannter Typ" }, { status: 400 })
  } catch (e) {
    console.error("[/api/import/reimport] Error:", e)
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 })
  }
}

function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

async function fetchPdfBuffer(
  request: NextRequest,
  type: string,
  id: number,
  pdfPath: string | null,
  paperlessDocId: number | null
): Promise<Buffer | null> {
  if (pdfPath && fs.existsSync(pdfPath)) {
    return fs.readFileSync(pdfPath)
  }
  if (paperlessDocId) {
    const baseUrl = getBaseUrl(request)
    const res = await fetch(`${baseUrl}/api/import/pdf?type=${type}&id=${id}`)
    if (res.ok) {
      return Buffer.from(await res.arrayBuffer())
    }
  }
  return null
}
