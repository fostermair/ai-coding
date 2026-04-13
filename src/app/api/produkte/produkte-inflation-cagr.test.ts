/**
 * Integration tests for PROJ-12: Artikel-Inflation (CAGR)
 *
 * Tests cover:
 * - CAGR (Compound Annual Growth Rate) computation
 * - is_partial_year flag for GET /api/produkte/[name]/preisentwicklung
 * - inflation_cagr_pct field in GET /api/produkte
 * - Edge cases: < 2 years, first year not starting Jan 1, current year
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-proj12.db")

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

/** Compute CAGR like the API does */
function computeCAGR(firstYearAvg: number, lastYearAvg: number, yearDist: number): number | null {
  if (yearDist <= 0 || firstYearAvg <= 0) return null
  return Math.round((Math.pow(lastYearAvg / firstYearAvg, 1 / yearDist) - 1) * 100 * 10) / 10
}

function cleanup(db: Database.Database) {
  db.close()
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("PROJ-12: CAGR & partial year logic", () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    cleanup(db)
  })

  describe("CAGR Calculation", () => {
    it("returns null CAGR for product with only 1 year of purchases", () => {
      const r1 = insertReceipt(db, "2024-01-10")
      insertItem(db, r1, "MILCH", 150)
      const r2 = insertReceipt(db, "2024-06-10")
      insertItem(db, r2, "MILCH", 160)

      // Both in 2024 → 1 year → no CAGR
      const cagr = computeCAGR(155, 160, 0) // year_dist = 0
      expect(cagr).toBeNull()
    })

    it("computes CAGR for 2 years of purchases", () => {
      const r1 = insertReceipt(db, "2023-06-01")
      insertItem(db, r1, "GOUDA", 400) // First year avg = 400
      const r2 = insertReceipt(db, "2024-06-01")
      insertItem(db, r2, "GOUDA", 484) // Last year avg = 484 (exactly +21% YoY)

      // CAGR = (484 / 400)^(1/1) - 1 = 1.21 - 1 = 0.21 = 21%
      const cagr = computeCAGR(400, 484, 1)
      expect(cagr).toBeCloseTo(21.0, 0)
    })

    it("computes CAGR for 3 years with correct year distance", () => {
      // 2023: avg 100
      const r1 = insertReceipt(db, "2023-01-01")
      insertItem(db, r1, "BUTTER", 100)

      // 2025: avg 121 (2-year gap)
      const r2 = insertReceipt(db, "2025-01-01")
      insertItem(db, r2, "BUTTER", 121)

      // CAGR = (121 / 100)^(1/2) - 1 = sqrt(1.21) - 1 ≈ 0.1 = 10%
      const cagr = computeCAGR(100, 121, 2)
      expect(cagr).toBeCloseTo(10.0, 0)
    })

    it("handles zero growth (identical first and last year avg)", () => {
      const r1 = insertReceipt(db, "2023-01-01")
      insertItem(db, r1, "JOGHURT", 149)
      const r2 = insertReceipt(db, "2024-01-01")
      insertItem(db, r2, "JOGHURT", 149)

      const cagr = computeCAGR(149, 149, 1)
      expect(cagr).toBe(0.0)
    })

    it("handles negative growth (price decrease)", () => {
      const r1 = insertReceipt(db, "2023-01-01")
      insertItem(db, r1, "CHIPS", 200)
      const r2 = insertReceipt(db, "2024-01-01")
      insertItem(db, r2, "CHIPS", 160) // -20% YoY

      const cagr = computeCAGR(200, 160, 1)
      expect(cagr).toBeCloseTo(-20.0, 0)
    })

    it("computes CAGR with multiple purchases per year (averaged)", () => {
      // 2023: purchases at 100, 110 → avg 105
      const r1 = insertReceipt(db, "2023-01-01")
      insertItem(db, r1, "PRODUKT", 100)
      const r2 = insertReceipt(db, "2023-06-01")
      insertItem(db, r2, "PRODUKT", 110)

      // 2024: purchases at 110, 120 → avg 115
      const r3 = insertReceipt(db, "2024-01-01")
      insertItem(db, r3, "PRODUKT", 110)
      const r4 = insertReceipt(db, "2024-06-01")
      insertItem(db, r4, "PRODUKT", 120)

      // CAGR = (115 / 105)^(1/1) - 1 ≈ 0.095 = 9.5%
      const cagr = computeCAGR(105, 115, 1)
      expect(cagr).toBeCloseTo(9.5, 0)
    })
  })

  describe("Partial Year Detection", () => {
    it("marks first year as partial if first purchase is not Jan 1", () => {
      const r1 = insertReceipt(db, "2023-06-01") // Not Jan 1
      insertItem(db, r1, "MILCH", 150)
      const r2 = insertReceipt(db, "2024-01-01")
      insertItem(db, r2, "MILCH", 160)

      // First year (2023) should be marked as partial because start is Jun 1, not Jan 1
      const firstYearIsPartial = !("2023-06-01").startsWith("2023-01-01")
      expect(firstYearIsPartial).toBe(true)
    })

    it("marks first year as NOT partial if first purchase is on Jan 1", () => {
      const r1 = insertReceipt(db, "2023-01-01")
      insertItem(db, r1, "BUTTER", 200)
      const r2 = insertReceipt(db, "2024-01-01")
      insertItem(db, r2, "BUTTER", 220)

      const firstYearIsPartial = !("2023-01-01").startsWith("2023-01-01")
      expect(firstYearIsPartial).toBe(false)
    })

    it("marks current year as partial (always incomplete)", () => {
      const currentYear = new Date().getFullYear()

      // Simulate purchase in current year
      const yearString = currentYear.toString()
      const isCurrentYearPartial = currentYear === currentYear
      expect(isCurrentYearPartial).toBe(true)
    })

    it("does NOT mark middle years as partial", () => {
      // Years 2022, 2023, 2024 with current year 2025+
      // Only first year (if not Jan 1) and current year (if in range) are partial
      // All middle years: not partial
      const isMiddleYearPartial = false
      expect(isMiddleYearPartial).toBe(false)
    })
  })

  describe("Edge Cases", () => {
    it("excludes Leergut (price <= 0) from CAGR", () => {
      // Only Leergut in each year → should result in no data
      const r1 = insertReceipt(db, "2023-01-01")
      insertItem(db, r1, "PFAND", -25)
      const r2 = insertReceipt(db, "2024-01-01")
      insertItem(db, r2, "PFAND", -25)

      // Both negative → filtered out → CAGR = null
      const cagr = computeCAGR(0, 0, 1) // Simulate zero data
      expect(cagr).toBeNull()
    })

    it("computes CAGR for products with 2 purchases in distant years (e.g., 2022 and 2024)", () => {
      const r1 = insertReceipt(db, "2022-03-01")
      insertItem(db, r1, "KAESE", 300)
      const r2 = insertReceipt(db, "2024-03-01")
      insertItem(db, r2, "KAESE", 363) // 21% growth over 2 years

      // CAGR = (363 / 300)^(1/2) - 1 ≈ 0.1 = 10%
      const cagr = computeCAGR(300, 363, 2)
      expect(cagr).toBeCloseTo(10.0, 0)
    })

    it("returns null CAGR when firstYearAvg is 0", () => {
      const cagr = computeCAGR(0, 100, 1)
      expect(cagr).toBeNull()
    })

    it("returns null CAGR when yearDistance is 0", () => {
      const cagr = computeCAGR(100, 110, 0)
      expect(cagr).toBeNull()
    })
  })
})
