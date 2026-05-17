/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"

interface EinkaufsverbgleichResponse {
  kann_vergleichen: boolean
  reason?: string
  letzter_einkauf?: { datum: string; gesamt_cents: number }
  vergleich?: { datum: string; typ: "voreinkauf"; gesamt_cents: number }
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

function queryVoreinkauf(testDb: Database.Database) {
  const receipts = testDb
    .prepare("SELECT id, receipt_date FROM receipts ORDER BY receipt_date DESC LIMIT 2")
    .all() as Array<{ id: number; receipt_date: string }>

  if (receipts.length < 2) {
    return {
      kann_vergleichen: false,
      reason: "Nur ein Einkauf vorhanden",
    }
  }

  const [lastReceipt, previousReceipt] = receipts

  const lastProducts = testDb
    .prepare(
      `SELECT ri.raw_name, ri.unit_price_cents
     FROM receipt_items ri
     LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
     WHERE ri.receipt_id = ?
       AND ri.unit_price_cents > 0
       AND (ri.item_type = 'product' OR ri.item_type = 'concession')
       AND COALESCE(pa.excluded_from_stats, 0) = 0`
    )
    .all(lastReceipt.id) as Array<{ raw_name: string; unit_price_cents: number }>

  if (lastProducts.length === 0) {
    return {
      kann_vergleichen: false,
      reason: "Nur ein Einkauf vorhanden",
    }
  }

  const lastReceiptTotal = lastProducts.reduce((sum, p) => sum + p.unit_price_cents, 0)

  const previousProducts = testDb
    .prepare(
      `SELECT ri.raw_name, ri.unit_price_cents
     FROM receipt_items ri
     LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
     WHERE ri.receipt_id = ?
       AND ri.unit_price_cents > 0
       AND (ri.item_type = 'product' OR ri.item_type = 'concession')
       AND COALESCE(pa.excluded_from_stats, 0) = 0`
    )
    .all(previousReceipt.id) as Array<{ raw_name: string; unit_price_cents: number }>

  const previousProductMap = new Map(previousProducts.map((p) => [p.raw_name, p.unit_price_cents]))
  const matchedProducts = lastProducts.filter((p) => previousProductMap.has(p.raw_name))

  if (matchedProducts.length === 0) {
    return {
      kann_vergleichen: false,
      reason: "Nur ein Einkauf vorhanden",
    }
  }

  const lastMatchedTotal = matchedProducts.reduce((sum, p) => sum + p.unit_price_cents, 0)
  const previousMatchedTotal = matchedProducts.reduce(
    (sum, p) => sum + previousProductMap.get(p.raw_name)!,
    0
  )

  const differenzCents = lastMatchedTotal - previousMatchedTotal
  const differenzProzent =
    previousMatchedTotal > 0 ? Math.round((differenzCents / previousMatchedTotal) * 1000) / 10 : 0

  return {
    kann_vergleichen: true,
    letzter_einkauf: {
      datum: lastReceipt.receipt_date,
      gesamt_cents: lastReceiptTotal,
    },
    vergleich: {
      datum: previousReceipt.receipt_date,
      typ: "voreinkauf",
      gesamt_cents: previousMatchedTotal,
    },
    vergleich_stats: {
      differenz_cents: differenzCents,
      differenz_prozent: differenzProzent,
      produkte_gezaehlt: matchedProducts.length,
      produkte_gesamt: lastProducts.length,
    },
  } as EinkaufsverbgleichResponse
}

describe("/api/statistiken/einkautskorb-vergleich/voreinkauf", () => {
  beforeEach(() => {
    db = setupDb()
  })

  it("should return 'Nur ein Einkauf vorhanden' when no receipts exist", () => {
    const result = queryVoreinkauf(db)
    expect(result.kann_vergleichen).toBe(false)
    expect(result.reason).toBe("Nur ein Einkauf vorhanden")
  })

  it("should return 'Nur ein Einkauf vorhanden' when only one receipt exists", () => {
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test.pdf', '2026-05-17')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 150, 150)"
    ).run()

    const result = queryVoreinkauf(db)
    expect(result.kann_vergleichen).toBe(false)
    expect(result.reason).toBe("Nur ein Einkauf vorhanden")
  })

  it("should return 'Nur ein Einkauf vorhanden' when no matching products between receipts", () => {
    // Last receipt
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test1.pdf', '2026-05-17')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 150, 150)"
    ).run()

    // Previous receipt (no matching products)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2026-05-10')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Cheese', 'product', 200, 200)"
    ).run()

    const result = queryVoreinkauf(db)
    expect(result.kann_vergleichen).toBe(false)
    expect(result.reason).toBe("Nur ein Einkauf vorhanden")
  })

  it("should calculate previous purchase comparison correctly", () => {
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
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Butter', 'product', 100, 100)"
    ).run()

    // Previous receipt (2026-05-10) - only Milk and Bread match
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2026-05-10')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Milk', 'product', 180, 180)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Bread', 'product', 120, 120)"
    ).run()

    const result = queryVoreinkauf(db)
    expect(result.kann_vergleichen).toBe(true)
    expect(result.letzter_einkauf?.gesamt_cents).toBe(450) // 200 + 150 + 100
    expect(result.vergleich?.gesamt_cents).toBe(300) // 180 + 120 (matched products only)
    expect(result.vergleich_stats?.differenz_cents).toBe(50) // (200+150) - (180+120) = 50
    expect(result.vergleich_stats?.differenz_prozent).toBe(16.7) // 50 / 300 * 100
    expect(result.vergleich_stats?.produkte_gezaehlt).toBe(2) // Matched products
    expect(result.vergleich_stats?.produkte_gesamt).toBe(3) // Total products in last receipt
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

    // Previous receipt
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2026-05-10')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Milk', 'product', 180, 180)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Bottle', 'product', 40, 40)"
    ).run()

    const result = queryVoreinkauf(db)
    expect(result.kann_vergleichen).toBe(true)
    expect(result.vergleich_stats?.produkte_gesamt).toBe(1) // Only Milk
    expect(result.vergleich_stats?.produkte_gezaehlt).toBe(1) // Only Milk matched
  })

  it("should handle price differences correctly (goods becoming cheaper)", () => {
    // Last receipt
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test1.pdf', '2026-05-17')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Milk', 'product', 180, 180)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (1, 'Bread', 'product', 120, 120)"
    ).run()

    // Previous receipt (more expensive)
    db.prepare(
      "INSERT INTO receipts (filename, receipt_date) VALUES ('test2.pdf', '2026-05-10')"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Milk', 'product', 200, 200)"
    ).run()
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (2, 'Bread', 'product', 150, 150)"
    ).run()

    const result = queryVoreinkauf(db)
    expect(result.kann_vergleichen).toBe(true)
    expect(result.vergleich_stats?.differenz_cents).toBe(-50) // (180+120) - (200+150) = -50
    expect(result.vergleich_stats?.differenz_prozent).toBe(-14.3) // -50 / 350 * 100 ≈ -14.3
  })
})
