/**
 * @vitest-environment node
 *
 * Integration tests for PROJ-38: Kategorien-Inflation
 * Tests the SQL query logic for category-level YoY inflation.
 */

import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"

const CURRENT_YEAR = new Date().getFullYear().toString()
const PREV_YEAR = (new Date().getFullYear() - 1).toString()

interface KategorienInflationItem {
  category: string
  inflation_pct: number | null
  product_count: number
  avg_current_price_cents: number | null
  avg_prev_price_cents: number | null
}

const DEFAULT_EXCLUDED = ["Pfand", "Tabak", "Drogerie"]

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
  `)

  return db
}

function insertReceipt(db: Database.Database, date: string): number {
  db.prepare("INSERT INTO receipts (filename, receipt_date) VALUES ('test.pdf', ?)").run(date)
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id
}

function insertItem(db: Database.Database, receiptId: number, rawName: string, priceCents: number, itemType = "product") {
  db.prepare(
    "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (?, ?, ?, ?, ?)"
  ).run(receiptId, rawName, itemType, priceCents, priceCents)
}

function insertAlias(db: Database.Database, rawName: string, alias: string, excludedFromStats = 0) {
  db.prepare("INSERT INTO product_aliases (raw_name, alias, excluded_from_stats) VALUES (?, ?, ?)").run(
    rawName,
    alias,
    excludedFromStats
  )
}

function insertCategory(db: Database.Database, alias: string, category: string) {
  db.prepare("INSERT INTO product_categories (alias, category) VALUES (?, ?)").run(alias, category)
}

function queryKategorienInflation(db: Database.Database, includeExcluded: boolean): KategorienInflationItem[] {
  const excludeClause = !includeExcluded
    ? `AND COALESCE(pc.category, 'Sonstiges') NOT IN (${DEFAULT_EXCLUDED.map(() => "?").join(", ")})`
    : ""
  const params = !includeExcluded ? DEFAULT_EXCLUDED : []

  return db
    .prepare(
      `WITH yearly_avg AS (
        SELECT
          COALESCE(pc.category, 'Sonstiges') AS category,
          strftime('%Y', r.receipt_date) AS jahr,
          AVG(ri.unit_price_cents) AS avg_cents,
          COUNT(DISTINCT COALESCE(pa.alias, ri.raw_name)) AS product_count
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri.receipt_id
        LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
        LEFT JOIN product_categories pc ON pc.alias = pa.alias
        WHERE ri.unit_price_cents > 0
          AND (ri.item_type = 'product' OR ri.item_type = 'concession')
          AND COALESCE(pa.excluded_from_stats, 0) = 0
          ${excludeClause}
          AND strftime('%Y', r.receipt_date) IN (
            strftime('%Y', 'now'),
            strftime('%Y', 'now', '-1 year')
          )
        GROUP BY category, jahr
      ),
      yoy AS (
        SELECT
          curr.category,
          CASE
            WHEN prev.avg_cents IS NOT NULL AND prev.avg_cents > 0
            THEN ROUND((curr.avg_cents - prev.avg_cents) / prev.avg_cents * 100, 1)
            ELSE NULL
          END AS inflation_pct,
          curr.product_count,
          ROUND(curr.avg_cents) AS avg_current_price_cents,
          ROUND(prev.avg_cents) AS avg_prev_price_cents
        FROM yearly_avg curr
        LEFT JOIN yearly_avg prev
          ON prev.category = curr.category
          AND prev.jahr = strftime('%Y', 'now', '-1 year')
        WHERE curr.jahr = strftime('%Y', 'now')
      )
      SELECT * FROM yoy
      ORDER BY
        CASE WHEN inflation_pct IS NULL THEN 1 ELSE 0 END,
        inflation_pct DESC`
    )
    .all(...params) as KategorienInflationItem[]
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PROJ-38: Kategorien-Inflation", () => {
  let db: Database.Database

  beforeEach(() => {
    db = setupDb()
  })

  describe("Leerer Zustand", () => {
    it("gibt leeres Array zurück wenn keine Bons importiert", () => {
      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(0)
    })

    it("gibt leeres Array zurück wenn Daten nur aus Vorjahr (kein aktuelles Jahr)", () => {
      const r = insertReceipt(db, `${PREV_YEAR}-06-01`)
      insertItem(db, r, "MILCH 1.5%", 149)
      insertAlias(db, "MILCH 1.5%", "Milch")
      insertCategory(db, "Milch", "Milchprodukte")

      const result = queryKategorienInflation(db, false)
      // No current year data → no rows in yoy CTE (WHERE curr.jahr = current_year)
      expect(result).toHaveLength(0)
    })
  })

  describe("inflation_pct = null (nur ein Jahr)", () => {
    it("liefert inflation_pct=null wenn Kategorie nur im aktuellen Jahr vorhanden", () => {
      const r = insertReceipt(db, `${CURRENT_YEAR}-03-01`)
      insertItem(db, r, "GOUDA", 350)
      insertAlias(db, "GOUDA", "Gouda")
      insertCategory(db, "Gouda", "Käse")

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(1)
      expect(result[0].category).toBe("Käse")
      expect(result[0].inflation_pct).toBeNull()
      expect(result[0].avg_current_price_cents).toBe(350)
      expect(result[0].avg_prev_price_cents).toBeNull()
    })
  })

  describe("Korrekte Inflationsberechnung (YoY)", () => {
    it("berechnet +10% Inflation korrekt", () => {
      const rPrev = insertReceipt(db, `${PREV_YEAR}-06-01`)
      insertItem(db, rPrev, "MILCH 1.5%", 100)
      insertAlias(db, "MILCH 1.5%", "Milch")
      insertCategory(db, "Milch", "Milchprodukte")

      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-06-01`)
      insertItem(db, rCurr, "MILCH 1.5%", 110)

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(1)
      expect(result[0].category).toBe("Milchprodukte")
      expect(result[0].inflation_pct).toBe(10.0)
      expect(result[0].avg_prev_price_cents).toBe(100)
      expect(result[0].avg_current_price_cents).toBe(110)
    })

    it("berechnet negative Inflation korrekt (-20%)", () => {
      const rPrev = insertReceipt(db, `${PREV_YEAR}-02-01`)
      insertItem(db, rPrev, "BUTTER", 250)
      insertAlias(db, "BUTTER", "Butter")
      insertCategory(db, "Butter", "Milchprodukte")

      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-02-01`)
      insertItem(db, rCurr, "BUTTER", 200)

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(1)
      expect(result[0].inflation_pct).toBe(-20.0)
    })

    it("berechnet 0% Inflation korrekt (keine Änderung)", () => {
      const rPrev = insertReceipt(db, `${PREV_YEAR}-01-15`)
      insertItem(db, rPrev, "JOGHURT", 149)
      insertAlias(db, "JOGHURT", "Joghurt")
      insertCategory(db, "Joghurt", "Milchprodukte")

      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-01-15`)
      insertItem(db, rCurr, "JOGHURT", 149)

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(1)
      expect(result[0].inflation_pct).toBe(0.0)
    })

    it("mittelt Preise mehrerer Produkte in einer Kategorie", () => {
      // Kategorie "Milchprodukte": Milch (100→110) und Butter (200→220)
      // Vorjahr: AVG(100, 200) = 150; Aktuell: AVG(110, 220) = 165
      // Inflation = (165 - 150) / 150 * 100 = 10%
      insertAlias(db, "MILCH", "Milch")
      insertCategory(db, "Milch", "Milchprodukte")
      insertAlias(db, "BUTTER", "Butter")
      insertCategory(db, "Butter", "Milchprodukte")

      const rPrev = insertReceipt(db, `${PREV_YEAR}-03-01`)
      insertItem(db, rPrev, "MILCH", 100)
      insertItem(db, rPrev, "BUTTER", 200)

      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-03-01`)
      insertItem(db, rCurr, "MILCH", 110)
      insertItem(db, rCurr, "BUTTER", 220)

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(1)
      expect(result[0].inflation_pct).toBe(10.0)
      expect(result[0].product_count).toBe(2)
    })
  })

  describe("Sortierung", () => {
    it("sortiert nach Inflation absteigend, null-Einträge zuletzt", () => {
      // Obst: +20% (prev+curr)
      insertAlias(db, "APFEL", "Apfel")
      insertCategory(db, "Apfel", "Obst")
      const rPrev1 = insertReceipt(db, `${PREV_YEAR}-01-01`)
      insertItem(db, rPrev1, "APFEL", 100)
      const rCurr1 = insertReceipt(db, `${CURRENT_YEAR}-01-01`)
      insertItem(db, rCurr1, "APFEL", 120)

      // Gemüse: +5% (prev+curr)
      insertAlias(db, "KAROTTE", "Karotte")
      insertCategory(db, "Karotte", "Gemüse")
      const rPrev2 = insertReceipt(db, `${PREV_YEAR}-02-01`)
      insertItem(db, rPrev2, "KAROTTE", 100)
      const rCurr2 = insertReceipt(db, `${CURRENT_YEAR}-02-01`)
      insertItem(db, rCurr2, "KAROTTE", 105)

      // Brot: nur aktuell → inflation_pct null
      insertAlias(db, "BROT", "Brot")
      insertCategory(db, "Brot", "Backwaren")
      const rCurr3 = insertReceipt(db, `${CURRENT_YEAR}-03-01`)
      insertItem(db, rCurr3, "BROT", 300)

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(3)
      expect(result[0].category).toBe("Obst") // +20% zuerst
      expect(result[1].category).toBe("Gemüse") // +5% zweiter
      expect(result[2].category).toBe("Backwaren") // null zuletzt
      expect(result[2].inflation_pct).toBeNull()
    })
  })

  describe("include_excluded Toggle", () => {
    beforeEach(() => {
      // Setup: Pfand-Kategorie
      insertAlias(db, "LEERGUT", "Leergut")
      insertCategory(db, "Leergut", "Pfand")
      const rPrev = insertReceipt(db, `${PREV_YEAR}-04-01`)
      insertItem(db, rPrev, "LEERGUT", 25)
      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-04-01`)
      insertItem(db, rCurr, "LEERGUT", 25)

      // Normales Produkt
      insertAlias(db, "MILCH", "Milch")
      insertCategory(db, "Milch", "Milchprodukte")
      const rPrev2 = insertReceipt(db, `${PREV_YEAR}-05-01`)
      insertItem(db, rPrev2, "MILCH", 100)
      const rCurr2 = insertReceipt(db, `${CURRENT_YEAR}-05-01`)
      insertItem(db, rCurr2, "MILCH", 110)
    })

    it("schließt Pfand/Tabak/Drogerie standardmäßig aus (include_excluded=false)", () => {
      const result = queryKategorienInflation(db, false)
      const categories = result.map((r) => r.category)
      expect(categories).not.toContain("Pfand")
      expect(categories).toContain("Milchprodukte")
    })

    it("bezieht ausgeschlossene Kategorien ein wenn include_excluded=true", () => {
      const result = queryKategorienInflation(db, true)
      const categories = result.map((r) => r.category)
      expect(categories).toContain("Pfand")
      expect(categories).toContain("Milchprodukte")
    })
  })

  describe("Sonstiges (Produkte ohne Kategorie)", () => {
    it("gruppiert Produkte ohne Kategorie unter 'Sonstiges'", () => {
      // Produkt mit Alias aber ohne Kategorie
      insertAlias(db, "UNBEKANNT X", "Unbekannt X")
      const rPrev = insertReceipt(db, `${PREV_YEAR}-07-01`)
      insertItem(db, rPrev, "UNBEKANNT X", 200)
      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-07-01`)
      insertItem(db, rCurr, "UNBEKANNT X", 220)

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(1)
      expect(result[0].category).toBe("Sonstiges")
      expect(result[0].inflation_pct).toBe(10.0)
    })

    it("gruppiert Produkte ohne Alias unter 'Sonstiges'", () => {
      // Kein Alias → kein Kategorie-JOIN → Sonstiges
      const rPrev = insertReceipt(db, `${PREV_YEAR}-08-01`)
      insertItem(db, rPrev, "ROHER ARTIKEL OHNE ALIAS", 300)
      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-08-01`)
      insertItem(db, rCurr, "ROHER ARTIKEL OHNE ALIAS", 330)

      const result = queryKategorienInflation(db, false)
      expect(result).toHaveLength(1)
      expect(result[0].category).toBe("Sonstiges")
    })
  })

  describe("excluded_from_stats Filterung", () => {
    it("schließt Produkte mit excluded_from_stats=1 aus", () => {
      insertAlias(db, "TABAK PRODUKT", "Tabak Produkt", 1) // excluded
      insertCategory(db, "Tabak Produkt", "Lebensmittel")

      const rPrev = insertReceipt(db, `${PREV_YEAR}-09-01`)
      insertItem(db, rPrev, "TABAK PRODUKT", 500)
      const rCurr = insertReceipt(db, `${CURRENT_YEAR}-09-01`)
      insertItem(db, rCurr, "TABAK PRODUKT", 600)

      const result = queryKategorienInflation(db, false)
      // excluded_from_stats=1 → filtered out even if category would otherwise match
      expect(result).toHaveLength(0)
    })
  })
})
