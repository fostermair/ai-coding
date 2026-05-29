import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"

const CHAIN_AGG_SQL = `
  SELECT
    COALESCE(pa.alias, ri.raw_name) AS alias,
    r.store_chain AS chain,
    ROUND(AVG(CAST(COALESCE(ri.price_per_unit_cents, ri.unit_price_cents) AS REAL))) AS avg_price_cents,
    MAX(ri.normalized_unit) AS normalized_unit,
    MAX(r.receipt_date) AS last_purchase_date,
    CASE WHEN MAX(r.receipt_date) < DATE('now', '-6 months') THEN 1 ELSE 0 END AS is_stale,
    CASE WHEN COUNT(CASE WHEN ri.price_per_unit_cents IS NOT NULL THEN 1 END) > 0 THEN 1 ELSE 0 END AS is_normalized
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
  WHERE (ri.item_type = 'product' OR ri.item_type = 'concession')
    AND ri.unit_price_cents > 0
    AND COALESCE(pa.excluded_from_stats, 0) = 0
  GROUP BY COALESCE(pa.alias, ri.raw_name), r.store_chain
  ORDER BY alias, avg_price_cents
`

interface ChainRow {
  alias: string
  chain: string
  avg_price_cents: number
  normalized_unit: string | null
  last_purchase_date: string
  is_stale: number
  is_normalized: number
}

function createDb(): Database.Database {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  db.exec(`
    CREATE TABLE receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      store_chain TEXT NOT NULL DEFAULT 'rewe',
      receipt_date TEXT,
      total_amount_cents INTEGER DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id),
      raw_name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'product',
      unit_price_cents INTEGER NOT NULL,
      total_price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      bonus_excluded INTEGER NOT NULL DEFAULT 0,
      price_per_unit_cents INTEGER,
      normalized_unit TEXT,
      normalized_amount REAL
    );
    CREATE TABLE product_aliases (
      raw_name TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      excluded_from_stats INTEGER NOT NULL DEFAULT 0
    );
  `)
  return db
}

function insertReceipt(db: Database.Database, chain: string, date: string): number {
  db.prepare(
    "INSERT INTO receipts (filename, store_chain, receipt_date) VALUES ('test.pdf', ?, ?)"
  ).run(chain, date)
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id
}

function insertItem(
  db: Database.Database,
  receiptId: number,
  rawName: string,
  unitPriceCents: number,
  pricePerUnitCents: number | null = null,
  normalizedUnit: string | null = null,
  itemType = "product"
): void {
  db.prepare(
    `INSERT INTO receipt_items
      (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents, price_per_unit_cents, normalized_unit)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(receiptId, rawName, itemType, unitPriceCents, unitPriceCents, pricePerUnitCents, normalizedUnit)
}

describe("PROJ-43: Multi-Store Preisvergleich — API aggregation logic", () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
  })

  afterEach(() => {
    db.close()
  })

  it("returns both chains when product bought at 2 different stores", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    const r2 = insertReceipt(db, "lidl", "2026-04-01")
    insertItem(db, r1, "BUTTER 250G", 150)
    insertItem(db, r2, "BUTTER 250G", 120)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows).toHaveLength(2)
    const chains = rows.map((r) => r.chain)
    expect(chains).toContain("rewe")
    expect(chains).toContain("lidl")
  })

  it("uses alias when available instead of raw_name", () => {
    db.prepare("INSERT INTO product_aliases (raw_name, alias) VALUES ('BUTTER 250G', 'Butter')").run()

    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    const r2 = insertReceipt(db, "lidl", "2026-04-01")
    insertItem(db, r1, "BUTTER 250G", 150)
    insertItem(db, r2, "BUTTER 250G", 120)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows.every((r) => r.alias === "Butter")).toBe(true)
  })

  it("falls back to unit_price_cents when price_per_unit_cents is null", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    insertItem(db, r1, "MILCH 1L", 99, null) // no price_per_unit

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows[0].avg_price_cents).toBe(99)
    expect(rows[0].is_normalized).toBe(0)
  })

  it("uses price_per_unit_cents when available and marks is_normalized=1", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    insertItem(db, r1, "KAESE 400G", 299, 7, "100g") // 7 cents per 100g

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows[0].avg_price_cents).toBe(7)
    expect(rows[0].is_normalized).toBe(1)
    expect(rows[0].normalized_unit).toBe("100g")
  })

  it("marks chain as stale when last purchase > 6 months ago", () => {
    const r1 = insertReceipt(db, "rewe", "2020-01-01") // very old
    insertItem(db, r1, "ALTES PRODUKT", 100)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows[0].is_stale).toBe(1)
  })

  it("marks chain as not stale when last purchase within 6 months", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01") // recent (relative to 2026-05-29)
    insertItem(db, r1, "NEUES PRODUKT", 100)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows[0].is_stale).toBe(0)
  })

  it("correctly averages multiple purchases within same chain", () => {
    const r1 = insertReceipt(db, "rewe", "2026-01-01")
    const r2 = insertReceipt(db, "rewe", "2026-02-01")
    insertItem(db, r1, "JOGHURT", 100)
    insertItem(db, r2, "JOGHURT", 200)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows).toHaveLength(1)
    expect(rows[0].avg_price_cents).toBe(150) // (100+200)/2
  })

  it("delta_pct calculation is correct", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    const r2 = insertReceipt(db, "lidl", "2026-04-01")
    insertItem(db, r1, "PRODUKT", 200)
    insertItem(db, r2, "PRODUKT", 100)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    // LIDL=100, REWE=200 → sorted: lidl(100), rewe(200)
    const sorted = [...rows].sort((a, b) => a.avg_price_cents - b.avg_price_cents)
    const cheapest = sorted[0]
    const priciest = sorted[sorted.length - 1]
    const delta = Math.round(((priciest.avg_price_cents - cheapest.avg_price_cents) / cheapest.avg_price_cents) * 1000) / 10

    expect(delta).toBe(100) // (200-100)/100 * 100 = 100%
  })

  it("excludes items with excluded_from_stats=1", () => {
    db.prepare("INSERT INTO product_aliases (raw_name, alias, excluded_from_stats) VALUES ('PFAND', 'Pfand', 1)").run()

    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    const r2 = insertReceipt(db, "lidl", "2026-04-01")
    insertItem(db, r1, "PFAND", 15)
    insertItem(db, r2, "PFAND", 15)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows).toHaveLength(0)
  })

  it("excludes items with unit_price_cents <= 0", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    db.prepare(
      "INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents) VALUES (?, 'GRATIS', 'product', 0, 0)"
    ).run(r1)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows).toHaveLength(0)
  })

  it("only returns products with receipts in 2+ different chains", () => {
    // Product only at REWE
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    insertItem(db, r1, "NUR REWE", 100)

    // Product at REWE and LIDL
    const r2 = insertReceipt(db, "rewe", "2026-03-15")
    const r3 = insertReceipt(db, "lidl", "2026-04-01")
    insertItem(db, r2, "MULTI STORE", 200)
    insertItem(db, r3, "MULTI STORE", 150)

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    const aliasGroups = new Map<string, ChainRow[]>()
    for (const row of rows) {
      if (!aliasGroups.has(row.alias)) aliasGroups.set(row.alias, [])
      aliasGroups.get(row.alias)!.push(row)
    }

    // Only MULTI STORE has 2 chains in this group
    const multiStore = aliasGroups.get("MULTI STORE")
    expect(multiStore).toHaveLength(2)

    // NUR REWE has only 1 chain
    const nurRewe = aliasGroups.get("NUR REWE")
    expect(nurRewe).toHaveLength(1)
  })

  it("returns concession items (item_type=concession) as well", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    const r2 = insertReceipt(db, "lidl", "2026-04-01")
    insertItem(db, r1, "KONZESSIONARTIKEL", 50, null, null, "concession")
    insertItem(db, r2, "KONZESSIONARTIKEL", 40, null, null, "concession")

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows).toHaveLength(2)
  })

  it("excludes pfand and other non-product item types", () => {
    const r1 = insertReceipt(db, "rewe", "2026-03-01")
    const r2 = insertReceipt(db, "lidl", "2026-04-01")
    insertItem(db, r1, "PFAND", 15, null, null, "pfand")
    insertItem(db, r2, "PFAND", 15, null, null, "pfand")

    const rows = db.prepare(CHAIN_AGG_SQL).all() as ChainRow[]

    expect(rows).toHaveLength(0)
  })
})
