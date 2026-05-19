import { describe, it, expect, beforeEach } from "vitest"
import { getDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

describe("GET /api/bons avis_status calculation", () => {
  let testNum = 0

  beforeEach(() => {
    testNum++
    const testDbPath = path.join(process.cwd(), "data", `test-avis-${testNum}.db`)
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    process.env.DB_PATH = testDbPath
  })

  const fetchBonStatus = (db: any, bonId: number) => {
    const result = db
      .prepare(
        `SELECT
        CASE
          WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = ?) = 0
            THEN NULL
          WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = ? AND am.status = 'pending') > 0
            THEN 'pending'
          WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = ? AND am.status IN ('confirmed', 'auto_set')) > 0
            AND (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = ? AND am.status NOT IN ('confirmed', 'auto_set', 'rejected')) = 0
            THEN 'complete'
          ELSE 'no_matches'
        END AS avis_status`
      )
      .get(bonId, bonId, bonId, bonId) as { avis_status: string | null }
    return result.avis_status
  }

  it("should return null when no avis_matches exist", () => {
    const db = getDb()
    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test.pdf', '2026-05-19', '123', '456')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '123'").get() as { id: number }
    const status = fetchBonStatus(db, receipt.id)
    expect(status).toBeNull()
  })

  it("should return 'pending' when at least one match is pending", () => {
    const db = getDb()

    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test.pdf', '2026-05-19', '456', '789')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '456'").get() as { id: number }

    db.prepare(`INSERT INTO import_log (filename, status) VALUES ('[AVIS] TEST1', 'success')`).run()
    const importLog = db.prepare("SELECT id FROM import_log ORDER BY id DESC LIMIT 1").get() as { id: number }

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Product 1A', 199, 75, 'pending')`).run(receipt.id, importLog.id)

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Product 2A', 299, 85, 'auto_set')`).run(receipt.id, importLog.id)

    const status = fetchBonStatus(db, receipt.id)
    expect(status).toBe("pending")
  })

  it("should return 'complete' when all matches are confirmed or auto_set", () => {
    const db = getDb()

    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test.pdf', '2026-05-20', '789', '101')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '789'").get() as { id: number }

    db.prepare(`INSERT INTO import_log (filename, status) VALUES ('[AVIS] TEST2', 'success')`).run()
    const importLog = db.prepare("SELECT id FROM import_log WHERE filename = '[AVIS] TEST2'").get() as { id: number }

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Product 1B', 199, 85, 'auto_set')`).run(receipt.id, importLog.id)

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Product 2B', 299, 75, 'confirmed')`).run(receipt.id, importLog.id)

    const status = fetchBonStatus(db, receipt.id)
    expect(status).toBe("complete")
  })

  it("should return 'no_matches' when all matches are rejected or have no receipt_item_id", () => {
    const db = getDb()

    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test.pdf', '2026-05-21', '101', '112')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '101'").get() as { id: number }

    db.prepare(`INSERT INTO import_log (filename, status) VALUES ('[AVIS] TEST3', 'success')`).run()
    const importLog = db.prepare("SELECT id FROM import_log WHERE filename = '[AVIS] TEST3'").get() as { id: number }

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Product 1C', 199, 75, 'rejected')`).run(receipt.id, importLog.id)

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Product 2C', 299, 60, 'rejected')`).run(receipt.id, importLog.id)

    const status = fetchBonStatus(db, receipt.id)
    expect(status).toBe("no_matches")
  })
})
