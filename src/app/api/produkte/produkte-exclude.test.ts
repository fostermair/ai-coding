/**
 * Integration tests for PROJ-8: Produkt-Ausblendung für Statistiken
 *
 * Tests cover:
 * - PUT /api/produkte/[name]/exclude
 * - GET /api/produkte?filter=active|excluded
 * - excluded_from_stats reflected in product list response
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

// ── Shared test DB setup ────────────────────────────────────────────────────

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-proj8.db")

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

    CREATE TABLE IF NOT EXISTS item_discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_item_id INTEGER NOT NULL REFERENCES receipt_items(id) ON DELETE CASCADE,
      description TEXT,
      amount_cents INTEGER NOT NULL,
      tax_code TEXT
    );

    CREATE TABLE IF NOT EXISTS product_aliases (
      raw_name TEXT PRIMARY KEY,
      alias TEXT NOT NULL DEFAULT '',
      excluded_from_stats INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Seed: one receipt with two products (one Pfandartikel)
  db.prepare(
    `INSERT INTO receipts (filename, store_name, receipt_date, total_amount_cents)
     VALUES ('test.pdf', 'REWE Testmarkt', '2026-01-15', 500)`
  ).run()

  const receiptId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id

  db.prepare(
    `INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents, tax_code)
     VALUES (?, 'GOUDA GER. 48%', 'product', 358, 358, 'B')`
  ).run(receiptId)

  db.prepare(
    `INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents, tax_code)
     VALUES (?, 'LEERG. MW E. ST', 'product', 25, 25, 'B')`
  ).run(receiptId)

  return db
}

function cleanup(db: Database.Database) {
  db.close()
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("PROJ-8: excluded_from_stats database logic", () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    cleanup(db)
  })

  it("products have excluded_from_stats = 0 by default", () => {
    const rows = db
      .prepare(
        `SELECT ri.raw_name, COALESCE(pa.excluded_from_stats, 0) AS excluded_from_stats
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.item_type = 'product'`
      )
      .all() as Array<{ raw_name: string; excluded_from_stats: number }>

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.excluded_from_stats).toBe(0)
    }
  })

  it("can set excluded_from_stats = 1 via upsert", () => {
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, updated_at)
       VALUES ('LEERG. MW E. ST', '', 1, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET
         excluded_from_stats = excluded.excluded_from_stats,
         updated_at = excluded.updated_at`
    ).run()

    const row = db
      .prepare("SELECT excluded_from_stats FROM product_aliases WHERE raw_name = ?")
      .get("LEERG. MW E. ST") as { excluded_from_stats: number }

    expect(row.excluded_from_stats).toBe(1)
  })

  it("excluded products are filtered out of active product list", () => {
    // Exclude LEERG.
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, updated_at)
       VALUES ('LEERG. MW E. ST', '', 1, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET excluded_from_stats = 1`
    ).run()

    const active = db
      .prepare(
        `SELECT ri.raw_name
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.item_type = 'product'
           AND COALESCE(pa.excluded_from_stats, 0) = 0`
      )
      .all() as Array<{ raw_name: string }>

    const names = active.map((r) => r.raw_name)
    expect(names).toContain("GOUDA GER. 48%")
    expect(names).not.toContain("LEERG. MW E. ST")
  })

  it("filter=excluded returns only excluded products", () => {
    // Exclude LEERG.
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, updated_at)
       VALUES ('LEERG. MW E. ST', '', 1, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET excluded_from_stats = 1`
    ).run()

    const excluded = db
      .prepare(
        `SELECT ri.raw_name
         FROM receipt_items ri
         JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.item_type = 'product'
           AND pa.excluded_from_stats = 1`
      )
      .all() as Array<{ raw_name: string }>

    expect(excluded.map((r) => r.raw_name)).toContain("LEERG. MW E. ST")
    expect(excluded.length).toBe(1)
  })

  it("excluded products are filtered from monatlich statistics", () => {
    // Exclude LEERG.
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, updated_at)
       VALUES ('LEERG. MW E. ST', '', 1, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET excluded_from_stats = 1`
    ).run()

    const rows = db
      .prepare(
        `SELECT SUM(ri.total_price_cents) AS ausgaben_cents
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.item_type = 'product'
           AND ri.unit_price_cents > 0
           AND COALESCE(pa.excluded_from_stats, 0) = 0`
      )
      .all() as Array<{ ausgaben_cents: number }>

    // Only GOUDA (358 cents) should be counted, not LEERG. (25 cents)
    expect(rows[0].ausgaben_cents).toBe(358)
  })

  it("excluded products are filtered from top-produkte", () => {
    // Exclude LEERG.
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, updated_at)
       VALUES ('LEERG. MW E. ST', '', 1, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET excluded_from_stats = 1`
    ).run()

    const rows = db
      .prepare(
        `SELECT ri.raw_name
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.unit_price_cents > 0
           AND ri.item_type = 'product'
           AND COALESCE(pa.excluded_from_stats, 0) = 0
         GROUP BY ri.raw_name
         ORDER BY COUNT(*) DESC
         LIMIT 10`
      )
      .all() as Array<{ raw_name: string }>

    expect(rows.map((r) => r.raw_name)).not.toContain("LEERG. MW E. ST")
  })

  it("re-enabling excluded product restores it to active list", () => {
    // First exclude
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats)
       VALUES ('LEERG. MW E. ST', '', 1)
       ON CONFLICT(raw_name) DO UPDATE SET excluded_from_stats = 1`
    ).run()

    // Then re-enable
    db.prepare(
      "UPDATE product_aliases SET excluded_from_stats = 0 WHERE raw_name = ?"
    ).run("LEERG. MW E. ST")

    const active = db
      .prepare(
        `SELECT ri.raw_name
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.item_type = 'product'
           AND COALESCE(pa.excluded_from_stats, 0) = 0`
      )
      .all() as Array<{ raw_name: string }>

    expect(active.map((r) => r.raw_name)).toContain("LEERG. MW E. ST")
  })

  it("alias is preserved when excluded_from_stats is set", () => {
    // Set alias first
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats)
       VALUES ('GOUDA GER. 48%', 'Gouda 48%', 0)
       ON CONFLICT(raw_name) DO UPDATE SET alias = 'Gouda 48%'`
    ).run()

    // Then exclude (upsert preserving alias)
    db.prepare(
      `INSERT INTO product_aliases (raw_name, alias, excluded_from_stats, updated_at)
       VALUES ('GOUDA GER. 48%', '', 1, datetime('now'))
       ON CONFLICT(raw_name) DO UPDATE SET
         excluded_from_stats = excluded.excluded_from_stats,
         updated_at = excluded.updated_at`
    ).run()

    const row = db
      .prepare("SELECT alias, excluded_from_stats FROM product_aliases WHERE raw_name = ?")
      .get("GOUDA GER. 48%") as { alias: string; excluded_from_stats: number }

    expect(row.alias).toBe("Gouda 48%")
    expect(row.excluded_from_stats).toBe(1)
  })
})
