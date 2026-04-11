import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DB_PATH = path.join(process.cwd(), "data", "ebon.db")

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma("journal_mode = WAL")
    _db.pragma("foreign_keys = ON")
    initSchema(_db)
  }
  return _db
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
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

    CREATE TABLE IF NOT EXISTS receipt_items (
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

    CREATE TABLE IF NOT EXISTS item_discounts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_item_id  INTEGER NOT NULL REFERENCES receipt_items(id) ON DELETE CASCADE,
      description      TEXT,
      amount_cents     INTEGER NOT NULL,
      tax_code         TEXT
    );

    CREATE TABLE IF NOT EXISTS product_aliases (
      raw_name    TEXT PRIMARY KEY,
      alias       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT NOT NULL,
      status      TEXT NOT NULL,
      message     TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_date
      ON receipts(receipt_date);
    CREATE INDEX IF NOT EXISTS idx_receipts_duplicate
      ON receipts(receipt_nr, market_nr, receipt_date);
    CREATE INDEX IF NOT EXISTS idx_items_receipt_id
      ON receipt_items(receipt_id);
    CREATE INDEX IF NOT EXISTS idx_items_raw_name
      ON receipt_items(raw_name);
  `)

  // Migration: add excluded_from_stats column if not present
  const cols = db.prepare("PRAGMA table_info(product_aliases)").all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === "excluded_from_stats")) {
    db.exec(
      "ALTER TABLE product_aliases ADD COLUMN excluded_from_stats INTEGER NOT NULL DEFAULT 0"
    )
  }
}
