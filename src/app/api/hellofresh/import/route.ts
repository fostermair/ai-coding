import { NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getDb } from "@/lib/db"

interface HFJsonEntry {
  Datum: string
  Bestellnummer: string
  Produkt: string
  Portionen: number | null
  Personen: number | null
  Grundpreis: number
  "Liefergebühren": number
  Rabatt: number
  "HelloFresh Cash": number
  Gesamt: number
  Status: string
}

function parseDate(datum: string): string {
  // "DD.MM.YYYY" → "YYYY-MM-DD"
  const [d, m, y] = datum.split(".")
  return `${y}-${m}-${d}`
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

export async function POST() {
  const filePath = path.join(process.cwd(), "data", "hellofresh", "hellofresh_zahlungsverlauf.json")

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "Datei nicht gefunden: data/hellofresh/hellofresh_zahlungsverlauf.json" },
      { status: 404 }
    )
  }

  let entries: HFJsonEntry[]
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    entries = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON in der Datei" }, { status: 400 })
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "Keine Einträge in der Datei gefunden" }, { status: 400 })
  }

  const db = getDb()

  const upsert = db.prepare(`
    INSERT INTO hellofresh_transactions
      (bestellnummer, datum, produkt, portionen, personen,
       grundpreis_cents, liefergebuehren_cents, rabatt_cents, hf_cash_cents, gesamt_cents, status)
    VALUES
      (@bestellnummer, @datum, @produkt, @portionen, @personen,
       @grundpreis_cents, @liefergebuehren_cents, @rabatt_cents, @hf_cash_cents, @gesamt_cents, @status)
    ON CONFLICT(bestellnummer) DO UPDATE SET
      datum = excluded.datum,
      produkt = excluded.produkt,
      portionen = excluded.portionen,
      personen = excluded.personen,
      grundpreis_cents = excluded.grundpreis_cents,
      liefergebuehren_cents = excluded.liefergebuehren_cents,
      rabatt_cents = excluded.rabatt_cents,
      hf_cash_cents = excluded.hf_cash_cents,
      gesamt_cents = excluded.gesamt_cents,
      status = excluded.status
  `)

  const existingNrs = new Set(
    (db.prepare("SELECT bestellnummer FROM hellofresh_transactions").all() as { bestellnummer: string }[])
      .map((r) => r.bestellnummer)
  )

  let imported = 0
  let updated = 0

  const runAll = db.transaction(() => {
    for (const entry of entries) {
      const isNew = !existingNrs.has(String(entry.Bestellnummer))
      upsert.run({
        bestellnummer: String(entry.Bestellnummer),
        datum: parseDate(entry.Datum),
        produkt: entry.Produkt,
        portionen: entry.Portionen ?? null,
        personen: entry.Personen ?? null,
        grundpreis_cents: toCents(entry.Grundpreis),
        liefergebuehren_cents: toCents(entry["Liefergebühren"]),
        rabatt_cents: toCents(entry.Rabatt),
        hf_cash_cents: toCents(entry["HelloFresh Cash"]),
        gesamt_cents: toCents(entry.Gesamt),
        status: entry.Status,
      })
      if (isNew) imported++
      else updated++
    }
  })

  runAll()

  return NextResponse.json({ imported, updated, total: imported + updated })
}
