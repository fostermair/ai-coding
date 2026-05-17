/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"

interface EinkaufsverbgleichResponse {
  kann_vergleichen: boolean
  reason?: string
  letzter_einkauf?: { datum: string; gesamt_cents: number }
  vergleich?: { datum: string; typ: "vorjahr"; gesamt_cents: number }
  vergleich_stats?: {
    differenz_cents: number
    differenz_prozent: number
    produkte_gezaehlt: number
    produkte_gesamt: number
  }
}

let db: Database.Database

function setupDb() {
  const testDb = new Database(":memory:")
  testDb.pragma("foreign_keys = ON")

  // Create schema
  testDb.exec(`
    CREATE TABLE receipts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      filename        TEXT NOT NULL,
      store_name      TEXT,
      store_address   TEXT,
      store_uid       TEXT,
      market_nr       TEXT,
      receipt_nr      TEXT,
      receipt_date    TEXT,
      receipt_time    TEXT,
      payment_method  TEXT,
      total_amount_cents INTEGER,
      imported_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE receipt_items (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id           INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      raw_name             TEXT NOT NULL,
      item_type            TEXT NOT NULL DEFAULT 'product',
      quantity             INTEGER NOT NULL DEFAULT 1,
      unit_price_cents     INTEGER NOT NULL,
      total_price_cents    INTEGER NOT NULL,
      tax_code             TEXT,
      bonus_excluded       INTEGER NOT NULL DEFAULT 0,
      concessionaire_code  TEXT,
      position             INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE product_aliases (
      raw_name    TEXT PRIMARY KEY,
      alias       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      excluded_from_stats INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_receipts_date ON receipts(receipt_date);
    CREATE INDEX idx_items_receipt_id ON receipt_items(receipt_id);
    CREATE INDEX idx_items_raw_name ON receipt_items(raw_name);
  `)

  return testDb
}

function queryVorjahr(testDb: Database.Database) {
  const lastReceiptRow = testDb
    .prepare("SELECT id, receipt_date FROM receipts ORDER BY receipt_date DESC LIMIT 1")
    .get() as { id: number; receipt_date: string } | undefined

  if (!lastReceiptRow) {
    return {
      kann_vergleichen: false,
      reason: "Nur ein Einkauf vorhanden",
    }
  }

  const lastProducts = testDb
    .prepare(
      `SELECT ri.raw_name, ri.unit_price_cents
     FROM receipt_items ri
     LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
     WHERE ri.receipt_id = ?
       AND ri.unit_price_cents > 0
       AND (ri.item_type = 'product' OR ri.item_type = 'concession')
       AND COALESCE(pa.excluded_from_stats, 0) = 0
     ORDER BY ri.raw_name`
    )
    .all(lastReceiptRow.id) as Array<{ raw_name: string; unit_price_cents: number }>

  if (lastProducts.length === 0) {
    return {
      kann_vergleichen: false,
      reason: "Keine Vorjahresdaten verfügbar",
    }
  }

  const lastReceiptTotal = lastProducts.reduce((sum, p) => sum + p.unit_price_cents, 0)

  const lastDate = new Date(lastReceiptRow.receipt_date)
  const targetDate = new Date(lastDate)
  targetDate.setFullYear(targetDate.getFullYear() - 1)
  const targetDateStr = targetDate.toISOString().split("T")[0]

  // Build placeholders for product names
  const productNames = lastProducts.map((p) => p.raw_name)
  const placeholders = productNames.map(() => "?").join(",")

  const yearAgoMatches = testDb
    .prepare(
      `WITH candidates AS (
     SELECT
       ri.raw_name,
       ri.unit_price_cents,
       r.receipt_date,
       ABS(julianday(r.receipt_date) - julianday(?)) as date_diff,
       ROW_NUMBER() OVER (PARTITION BY ri.raw_name ORDER BY ABS(julianday(r.receipt_date) - julianday(?)) ASC) as rn
     FROM receipt_items ri
     JOIN receipts r ON r.id = ri.receipt_id
     WHERE ri.raw_name IN (${placeholders})
       AND ri.unit_price_cents > 0
       AND (ri.item_type = 'product' OR ri.item_type = 'concession')
       AND ABS(julianday(r.receipt_date) - julianday(?)) <= 30
       AND r.id != ?
   )
   SELECT raw_name, unit_price_cents, receipt_date
   FROM candidates
   WHERE rn = 1`
    )
    .all(targetDateStr, targetDateStr, ...productNames, targetDateStr, lastReceiptRow.id) as Array<{
      raw_name: string
      unit_price_cents: number
      receipt_date: string
    }>

  if (yearAgoMatches.length === 0) {
    return {
      kann_vergleichen: false,
      reason: "Keine Vorjahresdaten verfügbar",
    }
  }

  const yearAgoTotal = yearAgoMatches.reduce((sum, p) => sum + p.unit_price_cents, 0)
  const differenzCents = lastReceiptTotal - yearAgoTotal
  const differenzProzent =
    yearAgoTotal > 0 ? Math.round((differenzCents / yearAgoTotal) * 1000) / 10 : 0

  const comparisonDate = yearAgoMatches[0]!.receipt_date

  return {
    kann_vergleichen: true,
    letzter_einkauf: {
      datum: lastReceiptRow.receipt_date,
      gesamt_cents: lastReceiptTotal,
    },
    vergleich: {
      datum: comparisonDate,
      typ: "vorjahr",
      gesamt_cents: yearAgoTotal,
    },
    vergleich_stats: {
      differenz_cents: differenzCents,
      differenz_prozent: differenzProzent,
      produkte_gezaehlt: yearAgoMatches.length,
      produkte_gesamt: lastProducts.length,
    },
  } as EinkaufsverbgleichResponse
}

describe("/api/statistiken/einkautskorb-vergleich/vorjahr", () => {
  beforeEach(() => {
    db = setupDb()
  })

  it("should return 'Nur ein Einkauf vorhanden' when no receipts exist", () => {
    const result = queryVorjahr(db)
    expect(result.kann_vergleichen).toBe(false)
    expect(result.reason).toBe("Nur ein Einkauf vorhanden")
  })

  it("should return 'Keine Vorjahresdaten verfügbar' when only one receipt exists but has products", () => {
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test.pdf', '2026-05-17')"
    ).run()

    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 150, 150)"
    ).run()

    const result = queryVorjahr(db)
    expect(result.kann_vergleichen).toBe(false)
    expect(result.reason).toBe("Keine Vorjahresdaten verfügbar")
  })

  it("should return 'Keine Vorjahresdaten verfügbar' when no matching products from year ago", () => {
    // Last receipt (recent)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test1.pdf', '2026-05-17')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 150, 150)"
    ).run()

    // Old receipt (no matching products, and outside ±30 day window)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2025-05-01')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Cheese', 'product', 200, 200)"
    ).run()

    const result = queryVorjahr(db)
    expect(result.kann_vergleichen).toBe(false)
    expect(result.reason).toBe("Keine Vorjahresdaten verfügbar")
  })

  it("should calculate year-over-year comparison correctly", () => {
    // Last receipt (2026-05-17)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test1.pdf', '2026-05-17')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 200, 200)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Bread', 'product', 150, 150)"
    ).run()

    // Year ago receipt (2025-05-15, within ±30 days)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2025-05-15')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Milk', 'product', 180, 180)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Bread', 'product', 120, 120)"
    ).run()

    const result = queryVorjahr(db)
    expect(result.kann_vergleichen).toBe(true)
    expect(result.letzter_einkauf?.gesamt_cents).toBe(350) // 200 + 150
    expect(result.vergleich?.gesamt_cents).toBe(300) // 180 + 120
    expect(result.vergleich_stats?.differenz_cents).toBe(50) // 350 - 300
    expect(result.vergleich_stats?.differenz_prozent).toBe(16.7) // 50 / 300 * 100
    expect(result.vergleich_stats?.produkte_gezaehlt).toBe(2)
    expect(result.vergleich_stats?.produkte_gesamt).toBe(2)
  })

  it("should exclude products marked as excluded_from_stats", () => {
    // Last receipt
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test1.pdf', '2026-05-17')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 200, 200)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Bottle', 'product', 50, 50)"
    ).run()

    // Mark Bottle as excluded
    db.prepare(
      "INSERT INTO product_aliases (raw_name, alias, excluded_from_stats) VALUES ('Bottle', 'Bottle', 1)"
    ).run()

    // Year ago receipt
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2025-05-15')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Milk', 'product', 180, 180)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Bottle', 'product', 40, 40)"
    ).run()

    const result = queryVorjahr(db)
    expect(result.kann_vergleichen).toBe(true)
    expect(result.letzter_einkauf?.gesamt_cents).toBe(200) // Only Milk
    expect(result.vergleich_stats?.produkte_gesamt).toBe(1) // Only Milk included
    expect(result.vergleich_stats?.produkte_gezaehlt).toBe(1)
  })

  it("should pick closest date within ±30 day window when multiple year-ago purchases exist", () => {
    // Last receipt
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test1.pdf', '2026-05-17')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 200, 200)"
    ).run()

    // Far from target (2025-05-01, 46 days before target - outside window)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2025-05-01')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Milk', 'product', 150, 150)"
    ).run()

    // Close to target (2025-05-10, 5 days before target - within window)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test3.pdf', '2025-05-10')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (3, 'Milk', 'product', 170, 170)"
    ).run()

    const result = queryVorjahr(db)
    expect(result.kann_vergleichen).toBe(true)
    expect(result.vergleich?.gesamt_cents).toBe(170) // Should pick 2025-05-10 (closest)
  })
})
