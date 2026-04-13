/**
 * Integration tests for PROJ-11: Preistrend letzte 12 Monate
 *
 * Tests the 12-month window logic for price_trend_pct, trend_from_date,
 * and trend_to_date. All dates are relative to 2026-04-12 (today).
 *
 * Within 12 months: >= 2025-04-12
 * Outside 12 months: < 2025-04-12
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-proj11.db")

// ── Mirror the updated SQL from GET /api/produkte ─────────────────────────

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
       AND r2.receipt_date >= DATE('now', '-12 months')
     ORDER BY r2.receipt_date ASC, r2.receipt_time ASC
     LIMIT 1) AS first_price_cents,
    (SELECT ri2.total_price_cents
     FROM receipt_items ri2
     JOIN receipts r2 ON r2.id = ri2.receipt_id
     WHERE ri2.raw_name = ri.raw_name
       AND r2.receipt_date >= DATE('now', '-12 months')
     ORDER BY r2.receipt_date DESC, r2.receipt_time DESC
     LIMIT 1) AS trend_last_price_cents,
    (SELECT COUNT(*)
     FROM receipt_items ri2
     JOIN receipts r2 ON r2.id = ri2.receipt_id
     WHERE ri2.raw_name = ri.raw_name
       AND ri2.total_price_cents > 0
       AND r2.receipt_date >= DATE('now', '-12 months')) AS price_data_count,
    (SELECT r2.receipt_date
     FROM receipt_items ri2
     JOIN receipts r2 ON r2.id = ri2.receipt_id
     WHERE ri2.raw_name = ri.raw_name
       AND ri2.total_price_cents > 0
       AND r2.receipt_date >= DATE('now', '-12 months')
     ORDER BY r2.receipt_date ASC, r2.receipt_time ASC
     LIMIT 1) AS trend_from_date,
    (SELECT r2.receipt_date
     FROM receipt_items ri2
     JOIN receipts r2 ON r2.id = ri2.receipt_id
     WHERE ri2.raw_name = ri.raw_name
       AND r2.receipt_date >= DATE('now', '-12 months')
     ORDER BY r2.receipt_date DESC, r2.receipt_time DESC
     LIMIT 1) AS trend_to_date,
    MAX(r.receipt_date) AS last_purchase_date
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  WHERE ri.item_type = 'product' OR ri.item_type = 'concession'
  GROUP BY ri.raw_name
`

function computeTrend(
  first: number | null,
  trendLast: number | null,
  count: number
): number | null {
  if (count >= 2 && first != null && first !== 0 && trendLast != null && trendLast > 0) {
    return ((trendLast - first) / first) * 100
  }
  return null
}

// ── DB setup ─────────────────────────────────────────────────────────────────

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
     VALUES ('test.pdf', 'REWE', ?, '10:00:00', 500)`
  ).run(date)
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id
}

function insertItem(db: Database.Database, receiptId: number, rawName: string, priceCents: number) {
  db.prepare(
    `INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents)
     VALUES (?, ?, 'product', ?, ?)`
  ).run(receiptId, rawName, priceCents, priceCents)
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
    trend_last_price_cents: number | null
    price_data_count: number
    trend_from_date: string | null
    trend_to_date: string | null
    last_purchase_date: string
  }
  if (!row) return null
  return {
    ...row,
    price_trend_pct: computeTrend(
      row.first_price_cents,
      row.trend_last_price_cents,
      row.price_data_count
    ),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PROJ-11: 12-month price trend window", () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    cleanup(db)
  })

  it("shows trend for 2 purchases within last 12 months", () => {
    const r1 = insertReceipt(db, "2025-06-01") // ~10 months ago
    insertItem(db, r1, "GOUDA", 299)
    const r2 = insertReceipt(db, "2026-03-01") // ~1 month ago
    insertItem(db, r2, "GOUDA", 349)

    const p = getProduct(db, "GOUDA")
    expect(p?.price_data_count).toBe(2)
    expect(p?.price_trend_pct).toBeCloseTo(((349 - 299) / 299) * 100, 5)
    expect(p?.trend_from_date).toBe("2025-06-01")
    expect(p?.trend_to_date).toBe("2026-03-01")
  })

  it("returns null trend when last purchase is older than 12 months", () => {
    // Both purchases outside the 12-month window
    const r1 = insertReceipt(db, "2024-01-01")
    insertItem(db, r1, "BUTTER", 200)
    const r2 = insertReceipt(db, "2024-06-01")
    insertItem(db, r2, "BUTTER", 240)

    const p = getProduct(db, "BUTTER")
    expect(p?.price_data_count).toBe(0) // 0 qualifying purchases in window
    expect(p?.price_trend_pct).toBeNull()
    expect(p?.trend_from_date).toBeNull()
    expect(p?.trend_to_date).toBeNull()
    // Product still shows up in list with its last price
    expect(p?.last_price_cents).toBe(240)
    expect(p?.purchase_count).toBe(2)
  })

  it("returns null trend when only 1 purchase is within last 12 months", () => {
    // One old purchase (outside window), one recent
    const r1 = insertReceipt(db, "2024-01-01") // outside window
    insertItem(db, r1, "MILCH", 119)
    const r2 = insertReceipt(db, "2026-03-01") // inside window
    insertItem(db, r2, "MILCH", 149)

    const p = getProduct(db, "MILCH")
    expect(p?.price_data_count).toBe(1) // only 1 qualifying in window
    expect(p?.price_trend_pct).toBeNull()
  })

  it("uses only the 12-month window for trend, ignoring older purchases", () => {
    // Old purchase at 100 cents, two recent ones at 200 and 250
    const r0 = insertReceipt(db, "2023-01-01") // way outside window
    insertItem(db, r0, "KAESE", 100)
    const r1 = insertReceipt(db, "2025-07-01") // inside window
    insertItem(db, r1, "KAESE", 200)
    const r2 = insertReceipt(db, "2026-02-01") // inside window
    insertItem(db, r2, "KAESE", 250)

    const p = getProduct(db, "KAESE")
    expect(p?.price_data_count).toBe(2)
    // Trend should be 200→250, NOT 100→250
    expect(p?.first_price_cents).toBe(200)
    expect(p?.price_trend_pct).toBeCloseTo(((250 - 200) / 200) * 100, 5)
    expect(p?.trend_from_date).toBe("2025-07-01")
    expect(p?.trend_to_date).toBe("2026-02-01")
  })

  it("shows 0% trend when all prices within window are identical", () => {
    const r1 = insertReceipt(db, "2025-09-01")
    insertItem(db, r1, "JOGHURT", 149)
    const r2 = insertReceipt(db, "2026-01-01")
    insertItem(db, r2, "JOGHURT", 149)

    const p = getProduct(db, "JOGHURT")
    expect(p?.price_trend_pct).toBe(0)
  })

  it("excludes Leergut (price <= 0) from 12-month trend count", () => {
    const r1 = insertReceipt(db, "2025-10-01")
    insertItem(db, r1, "PFAND", -25)
    const r2 = insertReceipt(db, "2026-02-01")
    insertItem(db, r2, "PFAND", -25)

    const p = getProduct(db, "PFAND")
    expect(p?.price_data_count).toBe(0)
    expect(p?.price_trend_pct).toBeNull()
  })

  it("trend_from_date and trend_to_date are null when no qualifying purchases in window", () => {
    const r1 = insertReceipt(db, "2024-01-01")
    insertItem(db, r1, "ALT", 100)

    const p = getProduct(db, "ALT")
    expect(p?.trend_from_date).toBeNull()
    expect(p?.trend_to_date).toBeNull()
    expect(p?.price_trend_pct).toBeNull()
  })
})
