import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "ebon.db")

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH
  if (_db && _db.name !== dbPath) {
    _db.close()
    _db = null
  }
  if (!_db) {
    const dataDir = path.dirname(dbPath)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    _db = new Database(dbPath)
    _db.pragma("journal_mode = WAL")
    _db.pragma("foreign_keys = ON")
    initSchema(_db)
  }
  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
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

    CREATE TABLE IF NOT EXISTS avis_matches (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id          INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      receipt_item_id     INTEGER REFERENCES receipt_items(id) ON DELETE SET NULL,
      import_log_id       INTEGER NOT NULL REFERENCES import_log(id),
      avis_item_name      TEXT NOT NULL,
      avis_unit_price_cents INTEGER NOT NULL,
      confidence          INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
      status              TEXT NOT NULL DEFAULT 'pending',
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_date
      ON receipts(receipt_date);
    CREATE INDEX IF NOT EXISTS idx_receipts_duplicate
      ON receipts(receipt_nr, market_nr, receipt_date);
    CREATE INDEX IF NOT EXISTS idx_items_receipt_id
      ON receipt_items(receipt_id);
    CREATE INDEX IF NOT EXISTS idx_items_raw_name
      ON receipt_items(raw_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_avis_matches_dedup
      ON avis_matches(receipt_id, avis_item_name, import_log_id);
    CREATE INDEX IF NOT EXISTS idx_avis_matches_receipt_id
      ON avis_matches(receipt_id);
    CREATE INDEX IF NOT EXISTS idx_avis_matches_status
      ON avis_matches(status);
  `)

  // Migration: add excluded_from_stats column if not present
  const cols = db.prepare("PRAGMA table_info(product_aliases)").all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === "excluded_from_stats")) {
    db.exec(
      "ALTER TABLE product_aliases ADD COLUMN excluded_from_stats INTEGER NOT NULL DEFAULT 0"
    )
  }

  // Migration: add seasonal column if not present
  if (!cols.some((c) => c.name === "seasonal")) {
    db.exec(
      "ALTER TABLE product_aliases ADD COLUMN seasonal INTEGER NOT NULL DEFAULT 0"
    )
  }

  // Migration: add needs_reparse and paperless_doc_id columns to receipts
  const receiptCols = db
    .prepare("PRAGMA table_info(receipts)")
    .all() as Array<{ name: string }>
  if (!receiptCols.some((c) => c.name === "needs_reparse")) {
    db.exec("ALTER TABLE receipts ADD COLUMN needs_reparse INTEGER NOT NULL DEFAULT 0")
    // Mark existing receipts with numeric-only raw_name items as needing reparse
    db.exec(`
      UPDATE receipts SET needs_reparse = 1
      WHERE id IN (
        SELECT DISTINCT receipt_id FROM receipt_items
        WHERE raw_name GLOB '[0-9]' OR raw_name GLOB '[0-9][0-9]'
      )
    `)
  }
  if (!receiptCols.some((c) => c.name === "paperless_doc_id")) {
    db.exec("ALTER TABLE receipts ADD COLUMN paperless_doc_id INTEGER")
  }

  // Migration: add match_source column to avis_matches
  const avisMatchesCols = db
    .prepare("PRAGMA table_info(avis_matches)")
    .all() as Array<{ name: string }>
  if (!avisMatchesCols.some((c) => c.name === "match_source")) {
    db.exec("ALTER TABLE avis_matches ADD COLUMN match_source TEXT")
  }

  // Migration: add store_chain column to receipts for multi-supermarket support
  if (!receiptCols.some((c) => c.name === "store_chain")) {
    db.exec("ALTER TABLE receipts ADD COLUMN store_chain TEXT NOT NULL DEFAULT 'rewe'")
    db.exec("CREATE INDEX IF NOT EXISTS idx_receipts_store_chain ON receipts(store_chain)")
  }
}
