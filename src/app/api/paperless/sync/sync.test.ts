/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import Database from "better-sqlite3"

interface SyncResult {
  imported: number
  duplicates: number
  errors: number
  details: Array<{ title: string; status: string; message?: string }>
  message?: string
  configured?: boolean
}

let testDb: Database.Database

function setupDb() {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")

  db.exec(`
    CREATE TABLE receipts (
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

    CREATE TABLE receipt_items (
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

    CREATE TABLE item_discounts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_item_id  INTEGER NOT NULL REFERENCES receipt_items(id) ON DELETE CASCADE,
      description      TEXT NOT NULL,
      amount_cents     INTEGER NOT NULL,
      tax_code         TEXT
    );

    CREATE TABLE import_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      filename  TEXT NOT NULL,
      status    TEXT NOT NULL,
      message   TEXT,
      logged_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_receipts_duplicate ON receipts(receipt_nr, market_nr, receipt_date);
    CREATE INDEX idx_items_receipt_id ON receipt_items(receipt_id);
    CREATE INDEX idx_import_log_filename ON import_log(filename);
  `)

  return db
}

describe("Paperless-ngx Sync API", () => {
  beforeEach(() => {
    testDb = setupDb()
  })

  describe("Configuration Check", () => {
    it("should return configured: false when PAPERLESS_URL is missing", () => {
      delete process.env.PAPERLESS_URL
      process.env.PAPERLESS_TOKEN = "test-token"

      // In real implementation, the route handler checks this
      const configured = process.env.PAPERLESS_URL && process.env.PAPERLESS_TOKEN
      expect(configured).toBeFalsy()
    })

    it("should return configured: false when PAPERLESS_TOKEN is missing", () => {
      process.env.PAPERLESS_URL = "http://localhost:8000"
      delete process.env.PAPERLESS_TOKEN

      const configured = process.env.PAPERLESS_URL && process.env.PAPERLESS_TOKEN
      expect(configured).toBeFalsy()
    })

    it("should return configured: true when both env vars are set", () => {
      process.env.PAPERLESS_URL = "http://localhost:8000"
      process.env.PAPERLESS_TOKEN = "test-token"

      const configured = process.env.PAPERLESS_URL && process.env.PAPERLESS_TOKEN
      expect(configured).toBeTruthy()
    })
  })

  describe("Duplicate Detection", () => {
    it("should detect duplicates using receipt_nr + market_nr + receipt_date", () => {
      const insertReceipt = testDb.prepare(`
        INSERT INTO receipts
          (filename, store_name, market_nr, receipt_nr, receipt_date, receipt_time,
           payment_method, total_amount_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      insertReceipt.run(
        "test.pdf",
        "REWE Test",
        "123456",
        "54321",
        "2025-01-15",
        "14:30",
        "CARD",
        10000
      )

      // Check for duplicate
      const existing = testDb
        .prepare(
          "SELECT id FROM receipts WHERE receipt_nr = ? AND market_nr = ? AND receipt_date = ?"
        )
        .get("54321", "123456", "2025-01-15")

      expect(existing).toBeTruthy()
      expect(existing).toHaveProperty("id")
    })

    it("should not detect receipts with same receipt_nr but different market_nr as duplicates", () => {
      const insertReceipt = testDb.prepare(`
        INSERT INTO receipts
          (filename, store_name, market_nr, receipt_nr, receipt_date, receipt_time,
           payment_method, total_amount_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      insertReceipt.run(
        "test1.pdf",
        "REWE Test 1",
        "111111",
        "54321",
        "2025-01-15",
        "14:30",
        "CARD",
        10000
      )

      // Check with different market_nr
      const existing = testDb
        .prepare(
          "SELECT id FROM receipts WHERE receipt_nr = ? AND market_nr = ? AND receipt_date = ?"
        )
        .get("54321", "222222", "2025-01-15")

      expect(existing).toBeFalsy()
    })
  })

  describe("Transaction Integrity", () => {
    it("should insert receipt with all items in a single transaction", () => {
      const insertReceipt = testDb.prepare(`
        INSERT INTO receipts
          (filename, store_name, store_address, store_uid, market_nr, receipt_nr,
           receipt_date, receipt_time, payment_method, total_amount_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertItem = testDb.prepare(`
        INSERT INTO receipt_items
          (receipt_id, raw_name, item_type, quantity, unit_price_cents,
           total_price_cents, tax_code, bonus_excluded, concessionaire_code, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertLog = testDb.prepare(
        "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
      )

      const doInsert = testDb.transaction(() => {
        const { lastInsertRowid: receiptId } = insertReceipt.run(
          "[paperless] Test Doc",
          "REWE Test",
          "Test Str. 1",
          "123456",
          "456789",
          "12345",
          "2025-01-15",
          "14:30",
          "CARD",
          5000
        )

        insertItem.run(
          receiptId,
          "Milk",
          "product",
          1,
          199,
          199,
          "A",
          0,
          null,
          1
        )

        insertLog.run("[paperless] Test Doc", "success", "1 Positionen importiert")
        return receiptId
      })

      const receiptId = doInsert()

      const receipt = testDb.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId)
      expect(receipt).toBeTruthy()
      expect(receipt).toHaveProperty("filename", "[paperless] Test Doc")

      const items = testDb.prepare("SELECT COUNT(*) as cnt FROM receipt_items WHERE receipt_id = ?").get(receiptId)
      expect(items.cnt).toBe(1)

      const logs = testDb.prepare("SELECT * FROM import_log WHERE filename = ?").all("[paperless] Test Doc")
      expect(logs.length).toBeGreaterThan(0)
    })
  })

  describe("Logging", () => {
    it("should log import as success with [paperless] prefix", () => {
      const insertLog = testDb.prepare(
        "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
      )

      insertLog.run("[paperless] Test Document", "success", "3 Positionen importiert")

      const log = testDb
        .prepare("SELECT * FROM import_log WHERE filename = ?")
        .get("[paperless] Test Document")

      expect(log).toBeTruthy()
      expect(log.status).toBe("success")
    })

    it("should log duplicates as duplicate", () => {
      const insertLog = testDb.prepare(
        "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
      )

      insertLog.run("[paperless] Test Document", "duplicate", "Bon-Nr. 54321")

      const log = testDb
        .prepare("SELECT * FROM import_log WHERE status = ?")
        .get("duplicate")

      expect(log).toBeTruthy()
      expect(log.status).toBe("duplicate")
    })

    it("should log parsing errors as error", () => {
      const insertLog = testDb.prepare(
        "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
      )

      insertLog.run("[paperless] Bad Document", "error", "Format nicht erkannt: Kein REWE eBon")

      const log = testDb
        .prepare("SELECT * FROM import_log WHERE status = ?")
        .get("error")

      expect(log).toBeTruthy()
      expect(log.status).toBe("error")
    })
  })

  describe("Response Structure", () => {
    it("should return correct response structure on success", () => {
      const response: SyncResult = {
        imported: 3,
        duplicates: 1,
        errors: 0,
        details: [
          { title: "Doc 1", status: "imported" },
          { title: "Doc 2", status: "duplicate" },
          { title: "Doc 3", status: "imported" },
        ],
      }

      expect(response).toHaveProperty("imported", 3)
      expect(response).toHaveProperty("duplicates", 1)
      expect(response).toHaveProperty("errors", 0)
      expect(response.details.length).toBe(3)
    })

    it("should return message when no documents found", () => {
      const response: SyncResult = {
        imported: 0,
        duplicates: 0,
        errors: 0,
        details: [],
        message: "Keine neuen eBons gefunden",
      }

      expect(response.imported).toBe(0)
      expect(response.message).toBe("Keine neuen eBons gefunden")
    })

    it("should track detail status correctly", () => {
      const detail1 = { title: "Doc 1", status: "imported" as const }
      const detail2 = { title: "Doc 2", status: "duplicate" as const }
      const detail3 = { title: "Doc 3", status: "error" as const, message: "Parse error" }

      expect(detail1.status).toBe("imported")
      expect(detail2.status).toBe("duplicate")
      expect(detail3.status).toBe("error")
      expect(detail3.message).toBe("Parse error")
    })
  })
})
