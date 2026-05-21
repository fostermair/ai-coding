import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { parseKontoauszug } from "@/lib/parser/konto"

// ── pdfjs polyfill (same as in /api/import) ────────────────────────────────
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixMinimal {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true
    constructor(_init?: string | number[]) {}
    multiply() { return this }
    inverse() { return this }
    translate(tx = 0, ty = 0) {
      const m = new DOMMatrixMinimal(); m.e = this.e + tx; m.f = this.f + ty; return m
    }
    scale(sx = 1, sy = sx) {
      const m = new DOMMatrixMinimal(); m.a = this.a * sx; m.d = this.d * sy; return m
    }
    transformPoint(p: { x: number; y: number }) {
      return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f }
    }
  }
  // @ts-expect-error – polyfill for Node.js
  globalThis.DOMMatrix = DOMMatrixMinimal
}
if (typeof globalThis.ImageData === "undefined") {
  // @ts-expect-error – polyfill
  globalThis.ImageData = class ImageData { constructor(public width = 0, public height = 0) {} }
}
if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error – polyfill
  globalThis.Path2D = class Path2D {}
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: "Keine PDF-Datei erhalten" }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ message: "Nur PDF-Dateien werden akzeptiert" }, { status: 400 })
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "PDF-Datei ist zu groß (max. 10 MB)" }, { status: 400 })
    }

    // ── Extract text ───────────────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer())
    let pdfText: string
    try {
      const data = await pdfParse(buffer)
      pdfText = data.text
    } catch {
      return NextResponse.json({ message: "PDF konnte nicht verarbeitet werden" }, { status: 422 })
    }

    if (!pdfText || pdfText.trim().length < 50) {
      return NextResponse.json({ message: "PDF enthält keinen lesbaren Text" }, { status: 422 })
    }

    // ── Parse ──────────────────────────────────────────────────────────────
    let parsed
    try {
      parsed = parseKontoauszug(pdfText)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Format nicht erkannt"
      logImport(file.name, "error", msg)
      return NextResponse.json({ message: msg }, { status: 422 })
    }

    const db = getDb()

    // ── Duplicate check (whole statement) ─────────────────────────────────
    const existing = db
      .prepare("SELECT id FROM bank_statement_log WHERE konto_iban = ? AND periode = ?")
      .get(parsed.konto_iban, parsed.periode)

    if (existing) {
      const msg = `Kontoauszug für ${parsed.periode} bereits importiert`
      logImport(file.name, "duplicate", msg)
      return NextResponse.json({ message: msg, status: "duplicate" }, { status: 409 })
    }

    // ── Insert transactions ────────────────────────────────────────────────
    const insertTx = db.prepare(`
      INSERT OR IGNORE INTO bank_transactions
        (buchungsdatum, valutadatum, typ, beschreibung, haendler_name,
         empfaenger_name, verwendungszweck, iban, bic, betrag_cents,
         kontoauszug_datei, periode, konto_iban)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `)

    const insertStmt = db.prepare(`
      INSERT INTO bank_statement_log (konto_iban, periode, dateiname, transaktion_count)
      VALUES (?,?,?,?)
    `)

    let imported = 0
    let duplicates = 0
    let errors = 0

    const doInsert = db.transaction(() => {
      for (const tx of parsed.transactions) {
        try {
          const result = insertTx.run(
            tx.buchungsdatum, tx.valutadatum, tx.typ, tx.beschreibung,
            tx.haendler_name, tx.empfaenger_name, tx.verwendungszweck,
            tx.iban, tx.bic, tx.betrag_cents,
            file.name, parsed.periode, parsed.konto_iban
          )
          if (result.changes > 0) {
            imported++
          } else {
            duplicates++
          }
        } catch {
          errors++
        }
      }

      insertStmt.run(parsed.konto_iban, parsed.periode, file.name, imported)
    })

    doInsert()

    logImport(file.name, "success", `${imported} Transaktionen importiert, ${duplicates} Duplikate, ${errors} Fehler`)

    // ── Trigger matching ───────────────────────────────────────────────────
    try {
      await fetch(new URL("/api/konto/match", request.url), { method: "POST" })
    } catch {
      // Non-critical – matching can be triggered manually
    }

    return NextResponse.json({
      imported,
      duplicates,
      errors,
      periode: parsed.periode,
      status: "success",
    })
  } catch (e) {
    console.error("[/api/konto/import] Unexpected error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Import" }, { status: 500 })
  }
}

function logImport(filename: string, status: string, message: string): void {
  try {
    const db = getDb()
    db.prepare("INSERT INTO import_log (filename, status, message) VALUES (?,?,?)").run(
      filename, status, message
    )
  } catch {
    // Non-critical
  }
}
