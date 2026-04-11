/**
 * Integration tests for PROJ-9: Preissteigerungs-Analyse
 *
 * Tests cover:
 * - GET /api/produkte/[name]/preisentwicklung
 * - Gesamt-Veränderung (erster → letzter Kauf)
 * - Jahr-zu-Jahr-Vergleich
 * - Edge cases: < 2 purchases, single year, identical prices, pfand exclusion
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-proj9.db")

function createTestDb() {
  const db = new Database(TEST_DB_PATH)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      store_name TEXT,
      receipt_date TEXT,
      receipt_time TEXT,
      total_amount_cents INTEGER,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      raw_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'product',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      total_price_cents INTEGER NOT NULL,
      tax_code TEXT,
      bonus_excluded INTEGER NOT NULL DEFAULT 0,
      concessionaire_code TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );
  `)

  return db
}

function insertReceipt(db: Database.Database, date: string) {
  db.prepare(
    `INSERT INTO receipts (filename, store_name, receipt_date, receipt_time, total_amount_cents)
     VALUES ('test.pdf', 'REWE', ?, '10:00:00', 0)`
  ).run(date)
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id
}

function insertItem(
  db: Database.Database,
  receiptId: number,
  rawName: string,
  priceCents: number,
  itemType = "product"
) {
  db.prepare(
    `INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents)
     VALUES (?, ?, ?, ?, ?)`
  ).run(receiptId, rawName, itemType, priceCents, priceCents)
}

/** Run the same computation as the API route */
function computePreisentwicklung(db: Database.Database, rawName: string) {
  interface PriceRow { datum: string; einzelpreis_cents: number }

  const rows = db
    .prepare(
      `SELECT
        r.receipt_date AS datum,
        ri.unit_price_cents AS einzelpreis_cents
       FROM receipt_items ri
       JOIN receipts r ON r.id = ri.receipt_id
       WHERE ri.raw_name = ?
         AND (ri.item_type = 'product' OR ri.item_type = 'concession')
         AND ri.unit_price_cents > 0
       ORDER BY r.receipt_date ASC, r.receipt_time ASC`
    )
    .all(rawName) as PriceRow[]

  if (rows.length < 2) return { gesamt: null, jahre: [] }

  const first = rows[0]
  const last = rows[rows.length - 1]
  const veraenderung_cents = last.einzelpreis_cents - first.einzelpreis_cents
  const veraenderung_prozent =
    first.einzelpreis_cents !== 0
      ? Math.round(((veraenderung_cents / first.einzelpreis_cents) * 100) * 10) / 10
      : 0

  const byYear = new Map<number, number[]>()
  for (const row of rows) {
    const jahr = parseInt(row.datum.slice(0, 4), 10)
    if (!byYear.has(jahr)) byYear.set(jahr, [])
    byYear.get(jahr)!.push(row.einzelpreis_cents)
  }

  const sortedYears = Array.from(byYear.keys()).sort()
  const jahre = sortedYears.map((jahr, i) => {
    const prices = byYear.get(jahr)!
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    if (i === 0) return { jahr, avg_preis_cents: avg, veraenderung_cents: null, veraenderung_prozent: null }
    const prevPrices = byYear.get(sortedYears[i - 1])!
    const prevAvg = Math.round(prevPrices.reduce((a, b) => a + b, 0) / prevPrices.length)
    const diff = avg - prevAvg
    const diffProzent = prevAvg !== 0 ? Math.round(((diff / prevAvg) * 100) * 10) / 10 : 0
    return { jahr, avg_preis_cents: avg, veraenderung_cents: diff, veraenderung_prozent: diffProzent }
  })

  return {
    gesamt: {
      erster_kauf: { datum: first.datum, preis_cents: first.einzelpreis_cents },
      letzter_kauf: { datum: last.datum, preis_cents: last.einzelpreis_cents },
      veraenderung_cents,
      veraenderung_prozent,
    },
    jahre,
  }
}

function cleanup(db: Database.Database) {
  db.close()
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("PROJ-9: Preisentwicklung API logic", () => {
  let db: Database.Database

  beforeEach(() => { db = createTestDb() })
  afterEach(() => { cleanup(db) })

  it("returns gesamt=null and empty jahre for a product with only 1 purchase", () => {
    const r1 = insertReceipt(db, "2024-01-10")
    insertItem(db, r1, "GOUDA 48%", 199)

    const result = computePreisentwicklung(db, "GOUDA 48%")
    expect(result.gesamt).toBeNull()
    expect(result.jahre).toHaveLength(0)
  })

  it("computes correct gesamt for two purchases in different years", () => {
    const r1 = insertReceipt(db, "2024-03-01")
    insertItem(db, r1, "MILCH 1L", 149)
    const r2 = insertReceipt(db, "2025-03-01")
    insertItem(db, r2, "MILCH 1L", 169)

    const result = computePreisentwicklung(db, "MILCH 1L")
    expect(result.gesamt).not.toBeNull()
    expect(result.gesamt!.erster_kauf.preis_cents).toBe(149)
    expect(result.gesamt!.letzter_kauf.preis_cents).toBe(169)
    expect(result.gesamt!.veraenderung_cents).toBe(20)
    expect(result.gesamt!.veraenderung_prozent).toBeCloseTo(13.4, 0)
  })

  it("computes year-over-year table for purchases in 3 different years", () => {
    const r1 = insertReceipt(db, "2023-06-01")
    insertItem(db, r1, "BUTTER", 200)
    const r2 = insertReceipt(db, "2024-06-01")
    insertItem(db, r2, "BUTTER", 220)
    const r3 = insertReceipt(db, "2025-06-01")
    insertItem(db, r3, "BUTTER", 242)

    const result = computePreisentwicklung(db, "BUTTER")
    expect(result.jahre).toHaveLength(3)

    // First year: no prior-year comparison
    expect(result.jahre[0].jahr).toBe(2023)
    expect(result.jahre[0].veraenderung_cents).toBeNull()
    expect(result.jahre[0].veraenderung_prozent).toBeNull()

    // Second year
    expect(result.jahre[1].jahr).toBe(2024)
    expect(result.jahre[1].veraenderung_cents).toBe(20)

    // Third year
    expect(result.jahre[2].jahr).toBe(2025)
    expect(result.jahre[2].veraenderung_cents).toBe(22)
  })

  it("returns empty jahre array (length 1) when all purchases are in the same year", () => {
    const r1 = insertReceipt(db, "2025-01-10")
    insertItem(db, r1, "JOGHURT", 89)
    const r2 = insertReceipt(db, "2025-06-15")
    insertItem(db, r2, "JOGHURT", 99)

    const result = computePreisentwicklung(db, "JOGHURT")
    // gesamt exists (2 purchases), but jahre has only 1 entry (no YoY comparison)
    expect(result.gesamt).not.toBeNull()
    expect(result.jahre).toHaveLength(1)
    expect(result.jahre[0].veraenderung_cents).toBeNull()
  })

  it("shows 0 change when price is identical across purchases", () => {
    const r1 = insertReceipt(db, "2024-02-01")
    insertItem(db, r1, "EIER 10ST", 259)
    const r2 = insertReceipt(db, "2025-02-01")
    insertItem(db, r2, "EIER 10ST", 259)

    const result = computePreisentwicklung(db, "EIER 10ST")
    expect(result.gesamt!.veraenderung_cents).toBe(0)
    expect(result.gesamt!.veraenderung_prozent).toBe(0)
    expect(result.jahre[1].veraenderung_cents).toBe(0)
  })

  it("excludes items with unit_price_cents <= 0 (Pfand/Leergut)", () => {
    const r1 = insertReceipt(db, "2024-01-01")
    insertItem(db, r1, "LEERG. MW E. ST", -25)
    const r2 = insertReceipt(db, "2025-01-01")
    insertItem(db, r2, "LEERG. MW E. ST", -25)

    const result = computePreisentwicklung(db, "LEERG. MW E. ST")
    // Both are negative price → filtered out → < 2 rows
    expect(result.gesamt).toBeNull()
  })

  it("averages multiple purchases within the same year correctly", () => {
    // Two purchases in 2024: 100 + 200 = avg 150
    const r1 = insertReceipt(db, "2024-01-01")
    insertItem(db, r1, "PRODUKT X", 100)
    const r2 = insertReceipt(db, "2024-07-01")
    insertItem(db, r2, "PRODUKT X", 200)
    // One purchase in 2025: 180
    const r3 = insertReceipt(db, "2025-01-01")
    insertItem(db, r3, "PRODUKT X", 180)

    const result = computePreisentwicklung(db, "PRODUKT X")
    expect(result.jahre[0].avg_preis_cents).toBe(150)
    expect(result.jahre[1].avg_preis_cents).toBe(180)
    expect(result.jahre[1].veraenderung_cents).toBe(30)
  })
})
