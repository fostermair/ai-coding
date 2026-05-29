import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { PUT, DELETE } from "./route"
import { NextRequest } from "next/server"
import { getDb, closeDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import Database from "better-sqlite3"

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-tx-categories-id.db")

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

function makeParams(id: string) {
  return Promise.resolve({ id })
}

describe("PROJ-36: /api/konto/transactions/categories/[id]", () => {
  let seedId: number

  beforeEach(() => {
    closeDb()
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
    preSeedDb(TEST_DB_PATH)
    process.env.DB_PATH = TEST_DB_PATH
    const db = getDb()
    const row = db
      .prepare(
        "INSERT INTO transaction_categories (muster, kategorie) VALUES (?, ?) RETURNING id"
      )
      .get("REWE", "Lebensmittel") as { id: number }
    seedId = row.id
  })

  afterEach(() => {
    closeDb()
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
    delete process.env.DB_PATH
  })

  describe("PUT (update)", () => {
    it("updates muster and kategorie", async () => {
      const req = new NextRequest(`http://localhost/api/konto/transactions/categories/${seedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "REWE SAGT", kategorie: "Supermarkt" }),
      })
      const res = await PUT(req, { params: makeParams(String(seedId)) })
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.category.muster).toBe("REWE SAGT")
      expect(data.category.kategorie).toBe("Supermarkt")

      const db = getDb()
      const row = db
        .prepare("SELECT * FROM transaction_categories WHERE id = ?")
        .get(seedId) as Record<string, unknown>
      expect(row.muster).toBe("REWE SAGT")
    })

    it("returns 404 for unknown id", async () => {
      const req = new NextRequest("http://localhost/api/konto/transactions/categories/9999", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "X", kategorie: "Y" }),
      })
      const res = await PUT(req, { params: makeParams("9999") })
      expect(res.status).toBe(404)
    })

    it("returns 400 for empty muster", async () => {
      const req = new NextRequest(`http://localhost/api/konto/transactions/categories/${seedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "", kategorie: "Lebensmittel" }),
      })
      const res = await PUT(req, { params: makeParams(String(seedId)) })
      expect(res.status).toBe(400)
    })

    it("returns 409 when updating to a muster that already exists", async () => {
      const db = getDb()
      db.prepare(
        "INSERT INTO transaction_categories (muster, kategorie) VALUES (?, ?)"
      ).run("HelloFresh", "Kochbox")

      const req = new NextRequest(`http://localhost/api/konto/transactions/categories/${seedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: "HelloFresh", kategorie: "Lebensmittel" }),
      })
      const res = await PUT(req, { params: makeParams(String(seedId)) })
      expect(res.status).toBe(409)
    })
  })

  describe("DELETE", () => {
    it("deletes an existing rule", async () => {
      const req = new NextRequest(`http://localhost/api/konto/transactions/categories/${seedId}`, {
        method: "DELETE",
      })
      const res = await DELETE(req, { params: makeParams(String(seedId)) })
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.success).toBe(true)

      const db = getDb()
      const row = db
        .prepare("SELECT * FROM transaction_categories WHERE id = ?")
        .get(seedId)
      expect(row).toBeUndefined()
    })

    it("returns 404 for unknown id", async () => {
      const req = new NextRequest("http://localhost/api/konto/transactions/categories/9999", {
        method: "DELETE",
      })
      const res = await DELETE(req, { params: makeParams("9999") })
      expect(res.status).toBe(404)
    })

    it("returns 400 for non-numeric id", async () => {
      const req = new NextRequest("http://localhost/api/konto/transactions/categories/abc", {
        method: "DELETE",
      })
      const res = await DELETE(req, { params: makeParams("abc") })
      expect(res.status).toBe(400)
    })
  })
})
