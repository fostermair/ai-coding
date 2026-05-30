import Database from "better-sqlite3"
import path from "path"
import fs from "fs"
import { categorize } from "@/lib/categorization/engine"

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

  // Migration: add source column for alias origin tracking (PROJ-46)
  if (!cols.some((c) => c.name === "source")) {
    db.exec("ALTER TABLE product_aliases ADD COLUMN source TEXT")
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

  // Migration: add paperless_doc_id column to import_log
  const importLogCols = db
    .prepare("PRAGMA table_info(import_log)")
    .all() as Array<{ name: string }>
  if (!importLogCols.some((c) => c.name === "paperless_doc_id")) {
    db.exec("ALTER TABLE import_log ADD COLUMN paperless_doc_id INTEGER")
  }

  // Migration: add store_chain column to receipts for multi-supermarket support
  if (!receiptCols.some((c) => c.name === "store_chain")) {
    db.exec("ALTER TABLE receipts ADD COLUMN store_chain TEXT NOT NULL DEFAULT 'rewe'")
    db.exec("CREATE INDEX IF NOT EXISTS idx_receipts_store_chain ON receipts(store_chain)")
  }

  // PROJ-26: transaction_aliases table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_aliases (
      beschreibung TEXT PRIMARY KEY,
      alias        TEXT NOT NULL,
      logo_path    TEXT,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_aliases_alias ON transaction_aliases(alias);
  `)

  // PROJ-27: market_aliases table
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_aliases (
      store_name  TEXT PRIMARY KEY,
      alias       TEXT NOT NULL,
      logo_path   TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_market_aliases_alias ON market_aliases(alias);
  `)

  // PROJ-24: bank_transactions + bank_statement_log tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buchungsdatum TEXT NOT NULL,
      valutadatum TEXT,
      typ TEXT NOT NULL,
      beschreibung TEXT NOT NULL,
      haendler_name TEXT,
      empfaenger_name TEXT,
      verwendungszweck TEXT,
      iban TEXT,
      bic TEXT,
      betrag_cents INTEGER NOT NULL,
      kontoauszug_datei TEXT,
      periode TEXT NOT NULL,
      konto_iban TEXT NOT NULL,
      importiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      matched_receipt_id INTEGER REFERENCES receipts(id),
      match_source TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_unique
      ON bank_transactions(konto_iban, buchungsdatum, betrag_cents, beschreibung);
    CREATE INDEX IF NOT EXISTS idx_bank_tx_status
      ON bank_transactions(match_status);

    CREATE TABLE IF NOT EXISTS bank_statement_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      konto_iban TEXT NOT NULL,
      periode TEXT NOT NULL,
      dateiname TEXT,
      importiert_am TEXT NOT NULL DEFAULT (datetime('now')),
      transaktion_count INTEGER,
      paperless_doc_id INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_stmt_unique
      ON bank_statement_log(konto_iban, periode);
  `)

  // PROJ-25: is_virtual + bank_transaction_id on receipts
  const receiptCols2 = db.prepare("PRAGMA table_info(receipts)").all() as Array<{ name: string }>
  if (!receiptCols2.some((c) => c.name === "is_virtual")) {
    db.exec("ALTER TABLE receipts ADD COLUMN is_virtual INTEGER NOT NULL DEFAULT 0")
  }
  if (!receiptCols2.some((c) => c.name === "bank_transaction_id")) {
    db.exec(
      "ALTER TABLE receipts ADD COLUMN bank_transaction_id INTEGER REFERENCES bank_transactions(id)"
    )
  }

  // PROJ-29: paperless_doc_id on bank_statement_log
  const stmtCols = db.prepare("PRAGMA table_info(bank_statement_log)").all() as Array<{ name: string }>
  if (!stmtCols.some((c) => c.name === "paperless_doc_id")) {
    db.exec("ALTER TABLE bank_statement_log ADD COLUMN paperless_doc_id INTEGER")
  }

  // PROJ-32: bestellung_items table + import_log.pdf_path
  db.exec(`
    CREATE TABLE IF NOT EXISTS bestellung_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_log_id INTEGER NOT NULL REFERENCES import_log(id) ON DELETE CASCADE,
      order_number TEXT NOT NULL,
      article_name TEXT NOT NULL,
      quantity_amount REAL NOT NULL,
      quantity_unit TEXT NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      total_price_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bestellung_items_order_number
      ON bestellung_items(order_number);
    CREATE INDEX IF NOT EXISTS idx_bestellung_items_import_log_id
      ON bestellung_items(import_log_id);
  `)

  // Migration: add pdf_path column to import_log
  const importLogCols2 = db
    .prepare("PRAGMA table_info(import_log)")
    .all() as Array<{ name: string }>
  if (!importLogCols2.some((c) => c.name === "pdf_path")) {
    db.exec("ALTER TABLE import_log ADD COLUMN pdf_path TEXT")
  }

  // Migration: add order_date and order_total_cents to import_log
  const importLogCols3 = db.prepare("PRAGMA table_info(import_log)").all() as Array<{ name: string }>
  if (!importLogCols3.some((c) => c.name === "order_date")) {
    db.exec("ALTER TABLE import_log ADD COLUMN order_date TEXT")
  }
  if (!importLogCols3.some((c) => c.name === "order_total_cents")) {
    db.exec("ALTER TABLE import_log ADD COLUMN order_total_cents INTEGER")
  }

  // Migration: korrigiere falsch als 'rewe' gesetzte store_chain-Werte (idempotent).
  // Runs after is_virtual is guaranteed to exist (moved from above PROJ-24 tables).
  db.exec(`
    UPDATE receipts SET store_chain = 'lidl'     WHERE store_chain = 'rewe' AND LOWER(store_name) LIKE '%lidl%';
    UPDATE receipts SET store_chain = 'kaufland'  WHERE store_chain = 'rewe' AND LOWER(store_name) LIKE '%kaufland%';
    UPDATE receipts SET store_chain = 'edeka'     WHERE store_chain = 'rewe' AND LOWER(store_name) LIKE '%edeka%';
    UPDATE receipts SET store_chain = 'sonstige'
      WHERE store_chain = 'rewe' AND is_virtual = 1 AND LOWER(store_name) NOT LIKE '%rewe%';
  `)

  // PROJ-26: add hidden column to bank_transactions
  const bankTxCols = db.prepare("PRAGMA table_info(bank_transactions)").all() as Array<{ name: string }>
  if (!bankTxCols.some((c) => c.name === "hidden")) {
    db.exec("ALTER TABLE bank_transactions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0")
    db.exec("CREATE INDEX IF NOT EXISTS idx_bank_tx_hidden ON bank_transactions(hidden)")
  }

  // Migration: clean up duplicate virtual bons (caused by inconsistent beschreibung
  // field between parsing runs), then add UNIQUE index as guard
  const hasUniqBankTxIdx = (db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_receipts_bank_tx_id'")
    .get()) != null

  if (!hasUniqBankTxIdx) {
    // Step 1: keep only the oldest virtual bon per bank_transaction_id
    db.exec(`
      DELETE FROM receipts
      WHERE is_virtual = 1
        AND bank_transaction_id IS NOT NULL
        AND id NOT IN (
          SELECT MIN(id) FROM receipts
          WHERE is_virtual = 1 AND bank_transaction_id IS NOT NULL
          GROUP BY bank_transaction_id
        )
    `)

    // Step 2: remove duplicate bank_transactions (same konto_iban + date + amount),
    // keeping the row with the longest (most complete) beschreibung
    db.exec(`
      DELETE FROM bank_transactions
      WHERE id NOT IN (
        SELECT id FROM bank_transactions t1
        WHERE NOT EXISTS (
          SELECT 1 FROM bank_transactions t2
          WHERE t2.konto_iban = t1.konto_iban
            AND t2.buchungsdatum = t1.buchungsdatum
            AND t2.betrag_cents = t1.betrag_cents
            AND (
              LENGTH(t2.beschreibung) > LENGTH(t1.beschreibung)
              OR (LENGTH(t2.beschreibung) = LENGTH(t1.beschreibung) AND t2.id < t1.id)
            )
        )
      )
    `)

    // Step 3: add UNIQUE index — prevents duplicate virtual bons at DB level
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_bank_tx_id
        ON receipts(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL
    `)
  }

  // PROJ-34: source_type column on import_log to distinguish eBon/AVIS/Bestellung
  const importLogCols4 = db.prepare("PRAGMA table_info(import_log)").all() as Array<{ name: string }>
  if (!importLogCols4.some((c) => c.name === "source_type")) {
    db.exec("ALTER TABLE import_log ADD COLUMN source_type TEXT")
  }

  // Migration: order_number on import_log so Bestelländerungen (0 items) retain their order reference
  const importLogCols5 = db.prepare("PRAGMA table_info(import_log)").all() as Array<{ name: string }>
  if (!importLogCols5.some((c) => c.name === "order_number")) {
    db.exec("ALTER TABLE import_log ADD COLUMN order_number TEXT")
    // Backfill from bestellung_items for existing imports
    db.exec(`
      UPDATE import_log
      SET order_number = (
        SELECT order_number FROM bestellung_items WHERE import_log_id = import_log.id LIMIT 1
      )
      WHERE source_type = 'bestellung' AND order_number IS NULL
    `)
  }
  // Backfill runs every startup — idempotent (only updates NULL rows, fast once all rows are set)
  db.exec(`
    UPDATE import_log SET source_type = 'ebon'
      WHERE source_type IS NULL
        AND EXISTS (SELECT 1 FROM receipts WHERE receipts.filename = import_log.filename);
    UPDATE import_log SET source_type = 'bestellung'
      WHERE source_type IS NULL AND order_date IS NOT NULL;
    UPDATE import_log SET source_type = 'ebon'
      WHERE (source_type IS NULL OR source_type = 'avis')
        AND status = 'error'
        AND (
          message LIKE '%Kein REWE eBon%'
          OR message LIKE '%Kein Lidl eBon%'
          OR message LIKE '%Kein Kaufland eBon%'
          OR message LIKE '%kein lesbarer Text%'
          OR message LIKE '%PDF konnte nicht gelesen werden%'
          OR message LIKE '%PDF-Download%'
        );
    UPDATE import_log SET source_type = 'avis'
      WHERE source_type IS NULL
        AND filename LIKE '[AVIS] %';
    UPDATE import_log SET source_type = 'ebon'
      WHERE source_type IS NULL;
  `)

  // Migration: fix PFAND items incorrectly stored as 'product' — idempotent
  db.exec(`
    UPDATE receipt_items
    SET item_type = 'pfand'
    WHERE item_type = 'product' AND raw_name LIKE 'PFAND%'
  `)

  // PROJ-36: transaction_categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      muster     TEXT NOT NULL UNIQUE,
      kategorie  TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_categories_kategorie ON transaction_categories(kategorie);
  `)

  // Migration: add farbe column to transaction_categories
  const txCatCols = db.prepare("PRAGMA table_info(transaction_categories)").all() as Array<{ name: string }>
  if (!txCatCols.some((c) => c.name === "farbe")) {
    db.exec("ALTER TABLE transaction_categories ADD COLUMN farbe TEXT NOT NULL DEFAULT '#6366f1'")
  }

  // PROJ-45: product_categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_categories (
      alias      TEXT PRIMARY KEY,
      category   TEXT NOT NULL,
      source     TEXT NOT NULL CHECK(source IN ('auto','manual')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_product_categories_category
      ON product_categories(category);
  `)

  // PROJ-45: Backfill auto-categorization for all existing products (idempotent)
  const existingCatCount = (
    db.prepare("SELECT COUNT(*) AS n FROM product_categories").get() as { n: number }
  ).n
  const existingProductCount = (
    db.prepare(
      `SELECT COUNT(DISTINCT raw_name) AS n FROM receipt_items
       WHERE item_type = 'product' OR item_type = 'concession'`
    ).get() as { n: number }
  ).n
  if (existingCatCount === 0 && existingProductCount > 0) {
    const products = db
      .prepare(
        `SELECT DISTINCT ri.raw_name, pa.alias
         FROM receipt_items ri
         LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
         WHERE ri.item_type = 'product' OR ri.item_type = 'concession'`
      )
      .all() as Array<{ raw_name: string; alias: string | null }>
    const upsertCat = db.prepare(
      `INSERT OR IGNORE INTO product_categories (alias, category, source, updated_at)
       VALUES (?, ?, 'auto', datetime('now'))`
    )
    const backfill = db.transaction(() => {
      for (const row of products) {
        const category = categorize(row.raw_name, row.alias || undefined)
        upsertCat.run(row.raw_name, category)
      }
    })
    backfill()
  }

  // PROJ-39: normalized unit columns on receipt_items
  const itemCols = db.prepare("PRAGMA table_info(receipt_items)").all() as Array<{ name: string }>
  if (!itemCols.some((c) => c.name === "normalized_amount")) {
    db.exec("ALTER TABLE receipt_items ADD COLUMN normalized_amount REAL")
  }
  if (!itemCols.some((c) => c.name === "normalized_unit")) {
    db.exec("ALTER TABLE receipt_items ADD COLUMN normalized_unit TEXT")
  }
  if (!itemCols.some((c) => c.name === "price_per_unit_cents")) {
    db.exec("ALTER TABLE receipt_items ADD COLUMN price_per_unit_cents INTEGER")
  }

  // PROJ-41: substitution_dismissals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS substitution_dismissals (
      product_a_alias TEXT NOT NULL,
      product_b_alias TEXT NOT NULL,
      dismissed_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_a_alias, product_b_alias)
    );
  `)

  // PROJ-44: inflation_reference_values table with Destatis seed data
  db.exec(`
    CREATE TABLE IF NOT EXISTS inflation_reference_values (
      year                  INTEGER PRIMARY KEY,
      official_rate_percent REAL
    );
  `)
  const seedInflationInsert = db.prepare(
    `INSERT OR IGNORE INTO inflation_reference_values (year, official_rate_percent) VALUES (?, ?)`
  )
  for (const [year, rate] of [[2022, 12.4], [2023, 6.4], [2024, 2.0], [2025, null]] as [number, number | null][]) {
    seedInflationInsert.run(year, rate)
  }

  // PROJ-37: hellofresh_transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS hellofresh_transactions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      bestellnummer         TEXT NOT NULL UNIQUE,
      datum                 TEXT NOT NULL,
      produkt               TEXT NOT NULL,
      portionen             INTEGER,
      personen              INTEGER,
      grundpreis_cents      INTEGER NOT NULL,
      liefergebuehren_cents INTEGER NOT NULL,
      rabatt_cents          INTEGER NOT NULL,
      hf_cash_cents         INTEGER NOT NULL,
      gesamt_cents          INTEGER NOT NULL,
      status                TEXT NOT NULL,
      importiert_am         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hf_tx_bestellnummer
      ON hellofresh_transactions(bestellnummer);
    CREATE INDEX IF NOT EXISTS idx_hf_tx_datum
      ON hellofresh_transactions(datum);
  `)
}
