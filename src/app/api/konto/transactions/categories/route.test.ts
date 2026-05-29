import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET, POST } from "./route"
import { NextRequest } from "next/server"
import { getDb, closeDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import Database from "better-sqlite3"

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-tx-categories.db")

function preSeedDb(dbPath: string): void {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      store_name TEXT,
      store_address TEXT,
      store_uid TEXT,
      market_nr TEXT,
      receipt_nr TEXT,
      receipt_date TEXT,
      receipt_time TEXT,
      payment_method TEXT,
      total_amount_cents INTEGER,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      needs_reparse INTEGER NOT NULL DEFAULT 0,
      paperless_doc_id INTEGER,
      store_chain TEXT NOT NULL DEFAULT 'rewe',
      is_virtual INTEGER NOT NULL DEFAULT 0,
      bank_transaction_id INTEGER
    )
  `)
  db.close()
}

describe("PROJ-36: /api/konto/transactions/categories", () => {
  beforeEach(() => {
    closeDb()
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
    preSeedDb(TEST_DB_PATH)
    process.env.DB_PATH = TEST_DB_PATH
    getDb()
  })

  afterEach(() => {
    closeDb()
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
    delete process.env.DB_PATH
  })

  describe("GET", () => {
    it("returns empty list when no categories exist", async () => {
      const req = new NextRequest("http://localhost/api/konto/transactions/categories")
      const res = await GET()
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.categories).toEqual([])
    })

    it("returns existing categories ordered by id", async () => {
      const db = getDb()
      db.exec(`
        INSERT INTO transaction_categories (muster, kategorie) VALUES ('REWE', 'Lebensmittel');
        INSERT INTO transaction_categories (muster, kategorie) VALUES ('HelloFresh', 'Kochbox');
      `)
      const req = new NextRequest("http://localhost/api/konto/transactions/categories")
      const res = await GET()
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.categories).toHaveLength(2)
      expect(data.categories[0].muster).toBe("REWE")
      expect(data.categories[1].muster).toBe("HelloFresh")
    })
  })

  describe("POST", () => {
    it("creates a new category rule", async () => {
      const req = new NextRequest("http://localhost/api/konto/transactions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "REWE", kategorie: "Lebensmittel" }),
      })
      const res = await POST(req)
      const data = await res.json()
      expect(res.status).toBe(201)
      expect(data.category.muster).toBe("REWE")
      expect(data.category.kategorie).toBe("Lebensmittel")

      const db = getDb()
      const row = db
        .prepare("SELECT * FROM transaction_categories WHERE muster = 'REWE'")
        .get() as Record<string, unknown>
      expect(row).toBeDefined()
      expect(row.kategorie).toBe("Lebensmittel")
    })

    it("returns 400 when muster is empty", async () => {
      const req = new NextRequest("http://localhost/api/konto/transactions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "", kategorie: "Lebensmittel" }),
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("returns 400 when kategorie is empty", async () => {
      const req = new NextRequest("http://localhost/api/konto/transactions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "REWE", kategorie: "" }),
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("returns 409 for duplicate muster", async () => {
      const db = getDb()
      db.prepare(
        "INSERT INTO transaction_categories (muster, kategorie) VALUES (?, ?)"
      ).run("REWE", "Lebensmittel")

      const req = new NextRequest("http://localhost/api/konto/transactions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "REWE", kategorie: "Anderes" }),
      })
      const res = await POST(req)
      expect(res.status).toBe(409)
    })
  })
})
