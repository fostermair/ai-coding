import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getDb, closeDb } from "@/lib/db"
import { runMatching, rematchAfterBonImport } from "./konto-matching"
import * as fs from "fs"
import * as path from "path"

let testNum = 0

function useTestDb() {
  testNum++
  const testDbPath = path.join(process.cwd(), "data", `test-konto-matching-${testNum}.db`)
  closeDb()
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  process.env.DB_PATH = testDbPath
  return getDb()
}

function insertReceipt(
  db: ReturnType<typeof getDb>,
  opts: {
    receipt_date: string
    total_amount_cents: number
    store_chain?: string
    store_name?: string
    is_virtual?: number
  }
): number {
  const r = db
    .prepare(
      `INSERT INTO receipts (filename, store_name, receipt_date, receipt_time, total_amount_cents, store_chain, is_virtual, imported_at)
       VALUES ('test.pdf', ?, ?, '12:00', ?, ?, ?, datetime('now'))`
    )
    .run(
      opts.store_name ?? "Test Store",
      opts.receipt_date,
      opts.total_amount_cents,
      opts.store_chain ?? "rewe",
      opts.is_virtual ?? 0
    )
  return r.lastInsertRowid as number
}

function insertTransaction(
  db: ReturnType<typeof getDb>,
  opts: {
    buchungsdatum: string
    betrag_cents: number
    typ?: string
    beschreibung?: string
    haendler_name?: string
  }
): number {
  const r = db
    .prepare(
      `INSERT INTO bank_transactions (buchungsdatum, valutadatum, typ, beschreibung, haendler_name, betrag_cents, periode, konto_iban)
       VALUES (?, ?, ?, ?, ?, ?, '2026-05', 'DE78500240249610825030')`
    )
    .run(
      opts.buchungsdatum,
      opts.buchungsdatum,
      opts.typ ?? "kartenzahlung",
      opts.beschreibung ?? opts.haendler_name ?? "Test",
      opts.haendler_name ?? null,
      opts.betrag_cents
    )
  return r.lastInsertRowid as number
}

describe("runMatching", () => {
  let db: ReturnType<typeof getDb>

  beforeEach(() => {
    db = useTestDb()
  })

  afterEach(() => {
    closeDb()
    delete process.env.DB_PATH
  })

  it("auto-matches 1 candidate", () => {
    insertReceipt(db, { receipt_date: "2026-05-19", total_amount_cents: 4908, store_chain: "kaufland" })
    insertTransaction(db, {
      buchungsdatum: "2026-05-19",
      betrag_cents: -4908,
      beschreibung: "KAUFLAND PADERBORN 470",
    })

    const summary = runMatching(db)

    expect(summary.matched).toBe(1)
    expect(summary.pending).toBe(0)
    expect(summary.virtual).toBe(0)

    const tx = db
      .prepare("SELECT match_status, match_source FROM bank_transactions LIMIT 1")
      .get() as { match_status: string; match_source: string }
    expect(tx.match_status).toBe("matched")
    expect(tx.match_source).toBe("auto")
  })

  it("marks pending when multiple candidates", () => {
    insertReceipt(db, { receipt_date: "2026-05-19", total_amount_cents: 4908 })
    insertReceipt(db, { receipt_date: "2026-05-19", total_amount_cents: 4908 })
    insertTransaction(db, { buchungsdatum: "2026-05-19", betrag_cents: -4908, beschreibung: "REWE" })

    const summary = runMatching(db)

    expect(summary.pending).toBe(1)
    expect(summary.matched).toBe(0)
  })

  it("creates virtual bon when no candidates", () => {
    insertTransaction(db, {
      buchungsdatum: "2026-05-10",
      betrag_cents: -999,
      beschreibung: "UNBEKANNT",
      haendler_name: "Unbekannt GmbH",
    })

    const summary = runMatching(db)

    expect(summary.virtual).toBe(1)
    const virtualBon = db
      .prepare("SELECT * FROM receipts WHERE is_virtual = 1")
      .get() as { is_virtual: number; total_amount_cents: number; bank_transaction_id: number }
    expect(virtualBon).toBeDefined()
    expect(virtualBon.total_amount_cents).toBe(999)
  })

  it("respects ±1 day tolerance (receipt one day before tx)", () => {
    insertReceipt(db, { receipt_date: "2026-05-18", total_amount_cents: 5000 })
    insertTransaction(db, { buchungsdatum: "2026-05-19", betrag_cents: -5000 })

    const summary = runMatching(db)
    expect(summary.matched).toBe(1)
  })

  it("does NOT match receipt outside ±1 day", () => {
    insertReceipt(db, { receipt_date: "2026-05-15", total_amount_cents: 5000 })
    insertTransaction(db, { buchungsdatum: "2026-05-19", betrag_cents: -5000 })

    const summary = runMatching(db)
    expect(summary.matched).toBe(0)
    expect(summary.virtual).toBe(1)
  })

  it("does not process gutschrift transactions", () => {
    insertTransaction(db, {
      buchungsdatum: "2026-05-10",
      betrag_cents: 1000,
      typ: "gutschrift",
      beschreibung: "Gutschrift",
    })

    const summary = runMatching(db)
    expect(summary.matched + summary.pending + summary.virtual).toBe(0)
  })

  it("is idempotent: already-matched transactions are not re-processed", () => {
    insertReceipt(db, { receipt_date: "2026-05-19", total_amount_cents: 4908 })
    insertTransaction(db, { buchungsdatum: "2026-05-19", betrag_cents: -4908 })

    runMatching(db)
    const summary2 = runMatching(db)

    expect(summary2.matched).toBe(0)
    expect(summary2.virtual).toBe(0)
  })

  it("chain filter: KAUFLAND tx only matches kaufland receipt", () => {
    // REWE receipt
    insertReceipt(db, { receipt_date: "2026-05-19", total_amount_cents: 4908, store_chain: "rewe" })
    // KAUFLAND transaction
    insertTransaction(db, {
      buchungsdatum: "2026-05-19",
      betrag_cents: -4908,
      beschreibung: "KAUFLAND PADERBORN 470",
    })

    const summary = runMatching(db)
    // REWE receipt filtered out → no match → virtual
    expect(summary.matched).toBe(0)
    expect(summary.virtual).toBe(1)
  })
})

describe("rematchAfterBonImport", () => {
  let db: ReturnType<typeof getDb>

  beforeEach(() => {
    db = useTestDb()
  })

  afterEach(() => {
    closeDb()
    delete process.env.DB_PATH
  })

  it("links an unmatched transaction to a newly imported bon", () => {
    const txId = insertTransaction(db, {
      buchungsdatum: "2026-05-19",
      betrag_cents: -4908,
      beschreibung: "REWE",
    })
    const receiptId = insertReceipt(db, {
      receipt_date: "2026-05-19",
      total_amount_cents: 4908,
      store_chain: "rewe",
    })

    rematchAfterBonImport(db, receiptId, "2026-05-19", 4908, "rewe")

    const tx = db
      .prepare("SELECT match_status, matched_receipt_id FROM bank_transactions WHERE id = ?")
      .get(txId) as { match_status: string; matched_receipt_id: number }
    expect(tx.match_status).toBe("matched")
    expect(tx.matched_receipt_id).toBe(receiptId)
  })

  it("removes virtual bon and links to real bon", () => {
    const txId = insertTransaction(db, {
      buchungsdatum: "2026-05-19",
      betrag_cents: -4908,
      haendler_name: "Test Markt",
    })
    runMatching(db)

    const virtualBon = db
      .prepare("SELECT id FROM receipts WHERE is_virtual = 1")
      .get() as { id: number } | undefined
    expect(virtualBon).toBeDefined()

    const realReceiptId = insertReceipt(db, {
      receipt_date: "2026-05-19",
      total_amount_cents: 4908,
    })
    rematchAfterBonImport(db, realReceiptId, "2026-05-19", 4908, "rewe")

    const virtualBonAfter = db.prepare("SELECT id FROM receipts WHERE is_virtual = 1").get()
    expect(virtualBonAfter).toBeUndefined()

    const tx = db
      .prepare("SELECT match_status, matched_receipt_id FROM bank_transactions WHERE id = ?")
      .get(txId) as { match_status: string; matched_receipt_id: number }
    expect(tx.match_status).toBe("matched")
    expect(tx.matched_receipt_id).toBe(realReceiptId)
  })

  it("does NOT override manually assigned transactions", () => {
    const txId = insertTransaction(db, { buchungsdatum: "2026-05-19", betrag_cents: -4908 })
    const manualReceiptId = insertReceipt(db, {
      receipt_date: "2026-05-17",
      total_amount_cents: 4908,
    })

    db.prepare(
      "UPDATE bank_transactions SET match_status = 'matched', matched_receipt_id = ?, match_source = 'manual' WHERE id = ?"
    ).run(manualReceiptId, txId)

    const newReceiptId = insertReceipt(db, {
      receipt_date: "2026-05-19",
      total_amount_cents: 4908,
    })
    rematchAfterBonImport(db, newReceiptId, "2026-05-19", 4908, "rewe")

    const tx = db
      .prepare("SELECT matched_receipt_id FROM bank_transactions WHERE id = ?")
      .get(txId) as { matched_receipt_id: number }
    expect(tx.matched_receipt_id).toBe(manualReceiptId)
  })
})
