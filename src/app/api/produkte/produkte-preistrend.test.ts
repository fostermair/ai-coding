/**
 * Integration tests for PROJ-10: Preistrend-Indikator
 *
 * Tests the SQL query logic for first_price_cents, price_data_count,
 * and the JS computation of price_trend_pct across all edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-proj10.db")

// ── Helper: mirrors the SQL logic in GET /api/produkte ─────────────────────

const PRODUCT_QUERY = `
  SELECT
    ri.raw_name,
    COUNT(*) AS purchase_count,
    (SELECT ri2.total_price_cents
     FROM receipt_items ri2
     JOIN receipts r2 ON r2.id = ri2.receipt_id
     WHERE ri2.raw_name = ri.raw_name
     ORDER BY r2.receipt_date DESC, r2.receipt_time DESC
     LIMIT 1) AS last_price_cents,
    (SELECT ri2.total_price_cents
     FROM receipt_items ri2
     JOIN receipts r2 ON r2.id = ri2.receipt_id
     WHERE ri2.raw_name = ri.raw_name
       AND ri2.total_price_cents > 0
     ORDER BY r2.receipt_date ASC, r2.receipt_time ASC
     LIMIT 1) AS first_price_cents,
    (SELECT COUNT(*)
     FROM receipt_items ri2
     JOIN receipts r2 ON r2.id = ri2.receipt_id
     WHERE ri2.raw_name = ri.raw_name
       AND ri2.total_price_cents > 0) AS price_data_count,
    MAX(r.receipt_date) AS last_purchase_date
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  WHERE ri.item_type = 'product' OR ri.item_type = 'concession'
  GROUP BY ri.raw_name
`

function computeTrend(
  first: number | null,
  last: number | null,
  count: number
): number | null {
  if (count >= 2 && first != null && first !== 0 && last != null && last > 0) {
    return ((last - first) / first) * 100
  }
  return null
}

// ── DB setup ────────────────────────────────────────────────────────────────

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

    CREATE TABLE IF NOT EXISTS product_aliases (
      raw_name TEXT PRIMARY KEY,
      alias TEXT NOT NULL DEFAULT '',
      excluded_from_stats INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  return db
}

function insertReceipt(db: Database.Database, date: string, time = "10:00:00") {
  db.prepare(
    `INSERT INTO receipts (filename, store_name, receipt_date, receipt_time, total_amount_cents)
     VALUES ('test.pdf', 'REWE', ?, ?, 500)`
  ).run(date, time)
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id
}

function insertItem(
  db: Database.Database,
  receiptId: number,
  rawName: string,
  priceCents: number,
  type = "product"
) {
  db.prepare(
    `INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents)
     VALUES (?, ?, ?, ?, ?)`
  ).run(receiptId, rawName, type, priceCents, priceCents)
}

function cleanup(db: Database.Database) {
  db.close()
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
}

function getProduct(db: Database.Database, rawName: string) {
  const row = db
    .prepare(PRODUCT_QUERY + " HAVING ri.raw_name = ?")
    .get(rawName) as {
    raw_name: string
    purchase_count: number
    last_price_cents: number | null
    first_price_cents: number | null
    price_data_count: number
  }
  if (!row) return null
  return {
    ...row,
    price_trend_pct: computeTrend(
      row.first_price_cents,
      row.last_price_cents,
      row.price_data_count
    ),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PROJ-10: price trend calculation", () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    cleanup(db)
  })

  it("returns null trend for product with only 1 purchase", () => {
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "GOUDA", 299)

    const p = getProduct(db, "GOUDA")
    expect(p?.price_trend_pct).toBeNull()
    expect(p?.price_data_count).toBe(1)
  })

  it("returns positive trend when price increased", () => {
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "GOUDA", 299)
    const r2 = insertReceipt(db, "2026-02-01")
    insertItem(db, r2, "GOUDA", 349)

    const p = getProduct(db, "GOUDA")
    expect(p?.price_trend_pct).toBeCloseTo(((349 - 299) / 299) * 100, 5)
    expect(p?.price_trend_pct).toBeGreaterThan(0)
  })

  it("returns negative trend when price decreased", () => {
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "GOUDA", 399)
    const r2 = insertReceipt(db, "2026-02-01")
    insertItem(db, r2, "GOUDA", 299)

    const p = getProduct(db, "GOUDA")
    expect(p?.price_trend_pct).toBeCloseTo(((299 - 399) / 399) * 100, 5)
    expect(p?.price_trend_pct).toBeLessThan(0)
  })

  it("returns 0 trend when price is identical across purchases", () => {
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "GOUDA", 299)
    const r2 = insertReceipt(db, "2026-02-01")
    insertItem(db, r2, "GOUDA", 299)

    const p = getProduct(db, "GOUDA")
    expect(p?.price_trend_pct).toBe(0)
  })

  it("excludes Leergut (price <= 0) from trend calculation", () => {
    // Pfand item with negative price — single item, only Leergut
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "PFAND 0.25", -25, "concession")
    const r2 = insertReceipt(db, "2026-02-01")
    insertItem(db, r2, "PFAND 0.25", -25, "concession")

    const p = getProduct(db, "PFAND 0.25")
    expect(p?.price_data_count).toBe(0)
    expect(p?.price_trend_pct).toBeNull()
  })

  it("returns null trend when last purchase is Leergut (price <= 0)", () => {
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "PFAND 0.25", 25)
    const r2 = insertReceipt(db, "2026-02-01")
    insertItem(db, r2, "PFAND 0.25", -25) // last purchase is a deposit return

    const p = getProduct(db, "PFAND 0.25")
    // last_price_cents = -25 (unfiltered), so trend should be null
    expect(p?.price_trend_pct).toBeNull()
  })

  it("uses earliest purchase as first price and latest as last price", () => {
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "MILCH", 119)
    const r2 = insertReceipt(db, "2026-03-01")
    insertItem(db, r2, "MILCH", 149)
    const r3 = insertReceipt(db, "2026-02-01") // middle date
    insertItem(db, r3, "MILCH", 129)

    const p = getProduct(db, "MILCH")
    expect(p?.first_price_cents).toBe(119) // Jan = earliest
    expect(p?.last_price_cents).toBe(149)  // Mar = latest
    expect(p?.price_trend_pct).toBeCloseTo(((149 - 119) / 119) * 100, 5)
  })

  it("computes trend correctly for 3+ purchases", () => {
    const r1 = insertReceipt(db, "2026-01-01")
    insertItem(db, r1, "BUTTER", 200)
    const r2 = insertReceipt(db, "2026-02-01")
    insertItem(db, r2, "BUTTER", 220)
    const r3 = insertReceipt(db, "2026-03-01")
    insertItem(db, r3, "BUTTER", 250)

    const p = getProduct(db, "BUTTER")
    expect(p?.price_data_count).toBe(3)
    expect(p?.first_price_cents).toBe(200)
    expect(p?.last_price_cents).toBe(250)
    expect(p?.price_trend_pct).toBeCloseTo(25, 5) // 25% increase
  })
})
