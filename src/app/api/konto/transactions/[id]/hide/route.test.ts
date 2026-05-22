import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { PATCH } from "./route"
import { NextRequest } from "next/server"
import { getDb, closeDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import Database from "better-sqlite3"

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-tx-hide.db")

// Pre-seed receipts table including is_virtual so the korrigiere migration
// in initSchema (which references is_virtual before the migration adds it) succeeds.
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

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("PROJ-26: PATCH /api/konto/transactions/[id]/hide", () => {
  beforeEach(() => {
    closeDb()
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
    preSeedDb(TEST_DB_PATH)
    process.env.DB_PATH = TEST_DB_PATH
    getDb() // initialize schema
  })

  afterEach(() => {
    closeDb()
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH)
    delete process.env.DB_PATH
  })

  function insertTransaction(hidden = 0): number {
    const db = getDb()
    const result = db
      .prepare(
        `INSERT INTO bank_transactions
           (buchungsdatum, typ, beschreibung, betrag_cents, periode, konto_iban, hidden)
         VALUES ('2026-01-15', 'Lastschrift', 'REWE TEST', -4599, '2026-01', 'DE89370400440532013000', ?)`
      )
      .run(hidden)
    return result.lastInsertRowid as number
  }

  function patchHide(txId: number | string, body: unknown) {
    return new NextRequest(`http://localhost/api/konto/transactions/${txId}/hide`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("sets hidden to true", async () => {
    const txId = insertTransaction(0)
    const res = await PATCH(patchHide(txId, { hidden: true }), makeContext(String(txId)))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.hidden).toBe(1)

    const db = getDb()
    const row = db
      .prepare("SELECT hidden FROM bank_transactions WHERE id = ?")
      .get(txId) as { hidden: number }
    expect(row.hidden).toBe(1)
  })

  it("sets hidden to false", async () => {
    const txId = insertTransaction(1)
    const res = await PATCH(patchHide(txId, { hidden: false }), makeContext(String(txId)))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.hidden).toBe(0)

    const db = getDb()
    const row = db
      .prepare("SELECT hidden FROM bank_transactions WHERE id = ?")
      .get(txId) as { hidden: number }
    expect(row.hidden).toBe(0)
  })

  it("returns 400 for non-numeric ID", async () => {
    const res = await PATCH(patchHide("abc", { hidden: true }), makeContext("abc"))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.message).toContain("Ungültige")
  })

  it("returns 400 when body is missing or malformed", async () => {
    const txId = insertTransaction(0)
    const req = new NextRequest(`http://localhost/api/konto/transactions/${txId}/hide`, {
      method: "PATCH",
    })
    const res = await PATCH(req, makeContext(String(txId)))
    expect(res.status).toBe(400)
  })

  it("returns 404 when transaction does not exist", async () => {
    const res = await PATCH(patchHide(99999, { hidden: true }), makeContext("99999"))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.message).toContain("nicht gefunden")
  })
})
