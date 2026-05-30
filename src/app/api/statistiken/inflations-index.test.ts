/**
 * @vitest-environment node
 *
 * Integration tests for PROJ-44: Personal Inflations-Index
 * Tests the Laspeyres SQL query logic and edge cases.
 */

import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"

interface LaspeyresRow {
  raw_name: string
  basis_quantity: number
  basis_price: number
  current_price: number
}

function setupDb() {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")

  db.exec(`
    CREATE TABLE receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      receipt_date TEXT
    );

    CREATE TABLE receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      raw_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'product',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      total_price_cents INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE product_aliases (
      raw_name TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      excluded_from_stats INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE product_categories (
      alias TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE inflation_reference_values (
      year INTEGER PRIMARY KEY,
      official_rate_percent REAL
    );
  `)

  return db
}

function insertReceipt(db: Database.Database, date: string): number {
  db.prepare("INSERT INTO receipts (filename, receipt_date) VALUES ('test.pdf', ?)").run(date)
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id
}

function insertItem(
  db: Database.Database,
  receiptId: number,
  rawName: string,
  priceCents: number,
  quantity = 1,
  itemType = "product"
) {
  db.prepare(
    "INSERT INTO receipt_items (receipt_id, raw_name, item_type, quantity, unit_price_cents, total_price_cents) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(receiptId, rawName, itemType, quantity, priceCents, priceCents * quantity)
}

function insertAlias(
  db: Database.Database,
  rawName: string,
  alias: string,
  excludedFromStats = 0
) {
  db.prepare(
    "INSERT INTO product_aliases (raw_name, alias, excluded_from_stats) VALUES (?, ?, ?)"
  ).run(rawName, alias, excludedFromStats)
}

function insertCategory(db: Database.Database, rawName: string, category: string) {
  // product_categories.alias stores raw_name as key (see PROJ-45 backfill)
  db.prepare("INSERT INTO product_categories (alias, category) VALUES (?, ?)").run(
    rawName,
    category
  )
}

/** Runs the same SQL as computeLaspeyres in the route, with correct param ordering */
function computeLaspeyres(
  db: Database.Database,
  von: number,
  bis: number,
  kategorie: string | null = null
): { rate: number | null; count: number } {
  const kategoriClause = kategorie
    ? `AND COALESCE(pc.category, 'Sonstiges') = ?`
    : ""

  // Correct param order: [von, bis, (optional: kategorie), von, bis]
  const params: (string | number)[] = [String(von), String(bis)]
  if (kategorie) params.push(kategorie)
  params.push(String(von), String(bis))

  const rows = db
    .prepare(
      `WITH period_items AS (
        SELECT
          ri.raw_name,
          strftime('%Y', r.receipt_date) AS jahr,
          SUM(ri.quantity) AS total_quantity,
          AVG(ri.unit_price_cents) AS avg_price_cents
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
        LEFT JOIN product_categories pc ON pc.alias = ri.raw_name
        WHERE ri.unit_price_cents > 0
          AND (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND COALESCE(pa.excluded_from_stats, 0) = 0
          AND strftime('%Y', r.receipt_date) IN (?, ?)
          ${kategoriClause}
        GROUP BY ri.raw_name, strftime('%Y', r.receipt_date)
      ),
      base AS (
        SELECT raw_name, total_quantity, avg_price_cents
        FROM period_items WHERE jahr = ?
      ),
      curr AS (
        SELECT raw_name, avg_price_cents
        FROM period_items WHERE jahr = ?
      )
      SELECT
        b.raw_name,
        b.total_quantity AS basis_quantity,
        b.avg_price_cents AS basis_price,
        c.avg_price_cents AS current_price
      FROM base b
      INNER JOIN curr c ON c.raw_name = b.raw_name
      WHERE b.avg_price_cents > 0 AND c.avg_price_cents > 0`
    )
    .all(...params) as LaspeyresRow[]

  if (rows.length === 0) return { rate: null, count: 0 }

  let numerator = 0
  let denominator = 0
  for (const row of rows) {
    numerator += row.basis_quantity * row.current_price
    denominator += row.basis_quantity * row.basis_price
  }

  const rate =
    denominator > 0 ? Math.round((numerator / denominator - 1) * 1000) / 10 : null

  return { rate, count: rows.length }
}

function getAvailableYears(db: Database.Database): number[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT CAST(strftime('%Y', receipt_date) AS INTEGER) AS year
         FROM receipts WHERE receipt_date IS NOT NULL ORDER BY year`
      )
      .all() as { year: number }[]
  ).map((r) => r.year)
}

function getBaseMonths(db: Database.Database, year: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT strftime('%Y-%m', receipt_date)) AS n
         FROM receipts WHERE strftime('%Y', receipt_date) = ?`
      )
      .get(String(year)) as { n: number }
  ).n
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PROJ-44: Personal Inflations-Index", () => {
  let db: Database.Database

  beforeEach(() => {
    db = setupDb()
  })

  describe("Leerer Zustand", () => {
    it("gibt null zurück wenn keine Bons vorhanden", () => {
      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.rate).toBeNull()
      expect(result.count).toBe(0)
    })

    it("gibt leeres availableYears zurück wenn keine Daten", () => {
      const years = getAvailableYears(db)
      expect(years).toHaveLength(0)
    })

    it("gibt null zurück wenn nur ein Jahr Daten vorhanden", () => {
      const r = insertReceipt(db, "2025-03-01")
      insertItem(db, r, "MILCH", 100)

      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.rate).toBeNull()
      expect(result.count).toBe(0)
    })
  })

  describe("Laspeyres-Berechnung", () => {
    it("berechnet +5% Inflation korrekt (2 Produkte, gewichtet nach Menge)", () => {
      // Produkt A: qty=2, base=100, curr=110 → Beitrag: 2*110=220 (curr), 2*100=200 (base)
      // Produkt B: qty=1, base=200, curr=200 → Beitrag: 1*200=200 (curr), 1*200=200 (base)
      // Numerator=420, Denominator=400, Rate = (420/400 - 1) * 100 = 5.0%
      const rBase = insertReceipt(db, "2024-06-01")
      insertItem(db, rBase, "MILCH", 100, 2)
      insertItem(db, rBase, "BUTTER", 200, 1)

      const rCurr = insertReceipt(db, "2025-06-01")
      insertItem(db, rCurr, "MILCH", 110, 1) // quantity in curr year doesn't matter for Laspeyres
      insertItem(db, rCurr, "BUTTER", 200, 1)

      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.count).toBe(2)
      expect(result.rate).toBe(5.0)
    })

    it("berechnet -10% Inflation korrekt (Preisrückgang)", () => {
      const rBase = insertReceipt(db, "2024-03-01")
      insertItem(db, rBase, "KAFFEE", 500, 1)

      const rCurr = insertReceipt(db, "2025-03-01")
      insertItem(db, rCurr, "KAFFEE", 450, 1)

      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.rate).toBe(-10.0)
    })

    it("berechnet 0% korrekt (keine Preisänderung)", () => {
      const rBase = insertReceipt(db, "2024-01-01")
      insertItem(db, rBase, "JOGHURT", 149, 1)

      const rCurr = insertReceipt(db, "2025-01-01")
      insertItem(db, rCurr, "JOGHURT", 149, 1)

      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.rate).toBe(0.0)
    })

    it("mittelt Preise bei mehreren Käufen eines Produkts pro Jahr", () => {
      // MILCH: base average = (100+120)/2 = 110, curr = 121
      // Inflation = (2*121) / (2*110) - 1 = 10%
      const rBase1 = insertReceipt(db, "2024-01-01")
      insertItem(db, rBase1, "MILCH", 100, 1)
      const rBase2 = insertReceipt(db, "2024-06-01")
      insertItem(db, rBase2, "MILCH", 120, 1)

      const rCurr = insertReceipt(db, "2025-03-01")
      insertItem(db, rCurr, "MILCH", 121, 1)

      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.rate).toBe(10.0)
    })

    it("schließt Produkte aus, die nur in einem Jahr vorkommen (INNER JOIN)", () => {
      // MILCH in beiden Jahren → bleibt
      const rBase = insertReceipt(db, "2024-05-01")
      insertItem(db, rBase, "MILCH", 100, 1)
      insertItem(db, rBase, "NEU-PRODUKT", 200, 1) // nur im Basisjahr

      const rCurr = insertReceipt(db, "2025-05-01")
      insertItem(db, rCurr, "MILCH", 110, 1)
      insertItem(db, rCurr, "ANDERS-PRODUKT", 300, 1) // nur im aktuellen Jahr

      // Nur MILCH ist in beiden Jahren → count=1
      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.count).toBe(1)
      expect(result.rate).toBe(10.0)
    })
  })

  describe("excluded_from_stats Filterung", () => {
    it("schließt Produkte mit excluded_from_stats=1 aus der Berechnung aus", () => {
      const rBase = insertReceipt(db, "2024-04-01")
      insertItem(db, rBase, "MILCH", 100, 1)
      insertItem(db, rBase, "PFAND FLASCHE", 25, 1)

      insertAlias(db, "PFAND FLASCHE", "Pfand Flasche", 1) // excluded

      const rCurr = insertReceipt(db, "2025-04-01")
      insertItem(db, rCurr, "MILCH", 120, 1)
      insertItem(db, rCurr, "PFAND FLASCHE", 25, 1)

      const result = computeLaspeyres(db, 2024, 2025)
      // Only MILCH counts → +20%
      expect(result.count).toBe(1)
      expect(result.rate).toBe(20.0)
    })

    it("schließt Pfand-Items (item_type='pfand') aus", () => {
      const rBase = insertReceipt(db, "2024-02-01")
      insertItem(db, rBase, "MILCH", 100, 1)
      insertItem(db, rBase, "PFAND", 25, 1, "pfand") // pfand type

      const rCurr = insertReceipt(db, "2025-02-01")
      insertItem(db, rCurr, "MILCH", 110, 1)
      insertItem(db, rCurr, "PFAND", 25, 1, "pfand")

      const result = computeLaspeyres(db, 2024, 2025)
      expect(result.count).toBe(1)
      expect(result.rate).toBe(10.0)
    })
  })

  describe("Datenbasis-Warnung (< 6 Monate)", () => {
    it("Warnung wenn Basisjahr < 6 Monate Daten enthält", () => {
      // Nur 2 Monate im Basisjahr
      const r1 = insertReceipt(db, "2024-01-01")
      insertItem(db, r1, "MILCH", 100, 1)
      const r2 = insertReceipt(db, "2024-02-01")
      insertItem(db, r2, "MILCH", 100, 1)

      // 7 Monate im aktuellen Jahr
      for (let m = 1; m <= 7; m++) {
        const r = insertReceipt(db, `2025-0${m}-01`)
        insertItem(db, r, "MILCH", 110, 1)
      }

      const baseMonths = getBaseMonths(db, 2024)
      const currMonths = getBaseMonths(db, 2025)

      expect(baseMonths).toBeLessThan(6) // Triggers warning
      expect(currMonths).toBeGreaterThanOrEqual(6)
    })

    it("keine Warnung wenn beide Perioden ≥ 6 Monate Daten haben", () => {
      for (let m = 1; m <= 6; m++) {
        const r = insertReceipt(db, `2024-${String(m).padStart(2, "0")}-15`)
        insertItem(db, r, "MILCH", 100, 1)
      }
      for (let m = 1; m <= 6; m++) {
        const r = insertReceipt(db, `2025-${String(m).padStart(2, "0")}-15`)
        insertItem(db, r, "MILCH", 110, 1)
      }

      const baseMonths = getBaseMonths(db, 2024)
      const currMonths = getBaseMonths(db, 2025)

      expect(baseMonths).toBeGreaterThanOrEqual(6)
      expect(currMonths).toBeGreaterThanOrEqual(6)
    })
  })

  describe("Kategorie-Filter", () => {
    beforeEach(() => {
      // Milchprodukte: MILCH (100→110, +10%) und JOGHURT (200→240, +20%)
      // Backwaren: BROT (300→300, 0%)
      insertCategory(db, "MILCH", "Milchprodukte")
      insertCategory(db, "JOGHURT", "Milchprodukte")
      insertCategory(db, "BROT", "Backwaren")

      const rBase = insertReceipt(db, "2024-06-01")
      insertItem(db, rBase, "MILCH", 100, 1)
      insertItem(db, rBase, "JOGHURT", 200, 1)
      insertItem(db, rBase, "BROT", 300, 1)

      const rCurr = insertReceipt(db, "2025-06-01")
      insertItem(db, rCurr, "MILCH", 110, 1)
      insertItem(db, rCurr, "JOGHURT", 240, 1)
      insertItem(db, rCurr, "BROT", 300, 1)
    })

    it("ohne Filter: alle Produkte einbezogen", () => {
      const result = computeLaspeyres(db, 2024, 2025, null)
      expect(result.count).toBe(3)
    })

    it("Kategorie-Filter 'Milchprodukte' schließt Backwaren aus", () => {
      const result = computeLaspeyres(db, 2024, 2025, "Milchprodukte")
      expect(result.count).toBe(2) // MILCH + JOGHURT
      // Laspeyres: (1*110 + 1*240) / (1*100 + 1*200) = 350/300 - 1 = 16.7%
      expect(result.rate).toBe(16.7)
    })

    it("Kategorie-Filter 'Backwaren' gibt 0% zurück", () => {
      const result = computeLaspeyres(db, 2024, 2025, "Backwaren")
      expect(result.count).toBe(1) // Nur BROT
      expect(result.rate).toBe(0.0)
    })

    it("unbekannte Kategorie gibt null zurück", () => {
      const result = computeLaspeyres(db, 2024, 2025, "Elektronik")
      expect(result.rate).toBeNull()
      expect(result.count).toBe(0)
    })
  })

  describe("Referenzwerte (inflation_reference_values)", () => {
    it("Seed-Werte werden korrekt abgefragt", () => {
      db.prepare(
        "INSERT INTO inflation_reference_values (year, official_rate_percent) VALUES (?, ?)"
      ).run(2024, 2.0)
      db.prepare(
        "INSERT INTO inflation_reference_values (year, official_rate_percent) VALUES (?, ?)"
      ).run(2023, 6.4)

      const row2024 = db
        .prepare("SELECT official_rate_percent FROM inflation_reference_values WHERE year = ?")
        .get(2024) as { official_rate_percent: number | null }
      expect(row2024.official_rate_percent).toBe(2.0)

      const row2025 = db
        .prepare("SELECT official_rate_percent FROM inflation_reference_values WHERE year = ?")
        .get(2025)
      expect(row2025).toBeUndefined() // 2025 not inserted → no row
    })

    it("UPDATE via UPSERT ändert den bestehenden Wert", () => {
      db.prepare(
        "INSERT INTO inflation_reference_values (year, official_rate_percent) VALUES (?, ?)"
      ).run(2025, null)

      db.prepare(
        `INSERT INTO inflation_reference_values (year, official_rate_percent)
         VALUES (?, ?)
         ON CONFLICT(year) DO UPDATE SET official_rate_percent = excluded.official_rate_percent`
      ).run(2025, 3.5)

      const row = db
        .prepare("SELECT official_rate_percent FROM inflation_reference_values WHERE year = ?")
        .get(2025) as { official_rate_percent: number }
      expect(row.official_rate_percent).toBe(3.5)
    })
  })

  describe("availableYears und Consecutive-Pairs-Logik", () => {
    it("erkennt aufeinanderfolgende Jahre korrekt", () => {
      insertReceipt(db, "2023-06-01")
      insertReceipt(db, "2024-06-01")
      insertReceipt(db, "2025-06-01")

      const years = getAvailableYears(db)
      expect(years).toEqual([2023, 2024, 2025])

      const pairs: { von: number; bis: number }[] = []
      for (let i = 1; i < years.length; i++) {
        if (years[i] === years[i - 1] + 1) {
          pairs.push({ von: years[i - 1], bis: years[i] })
        }
      }
      expect(pairs).toHaveLength(2)
      expect(pairs[0]).toEqual({ von: 2023, bis: 2024 })
      expect(pairs[1]).toEqual({ von: 2024, bis: 2025 })
    })

    it("überspringt nicht-aufeinanderfolgende Jahre", () => {
      insertReceipt(db, "2022-06-01")
      insertReceipt(db, "2024-06-01") // 2023 fehlt

      const years = getAvailableYears(db)
      const pairs: { von: number; bis: number }[] = []
      for (let i = 1; i < years.length; i++) {
        if (years[i] === years[i - 1] + 1) {
          pairs.push({ von: years[i - 1], bis: years[i] })
        }
      }
      // No consecutive pairs (2022→2024 is not consecutive)
      expect(pairs).toHaveLength(0)
    })
  })
})
