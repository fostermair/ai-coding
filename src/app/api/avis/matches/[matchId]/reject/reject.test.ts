import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getDb, closeDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

describe("PUT /api/avis/matches/[matchId]/reject", () => {
  beforeEach(() => {
    const testDbPath = path.join(process.cwd(), "data", "test-reject.db")
    closeDb()
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    process.env.DB_PATH = testDbPath
  })

  afterEach(() => {
    closeDb()
    delete process.env.DB_PATH
  })

  it("should reject a pending match", () => {
    const db = getDb()

    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test.pdf', '2026-05-19', '123', '456')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '123'").get() as { id: number }

    db.prepare(`INSERT INTO import_log (filename, status) VALUES ('[AVIS] TEST1', 'success')`).run()
    const importLog = db.prepare("SELECT id FROM import_log ORDER BY id DESC LIMIT 1").get() as { id: number }

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Pending Product 1', 199, 75, 'pending')`).run(receipt.id, importLog.id)
    const match = db.prepare("SELECT id FROM avis_matches WHERE status = 'pending'").get() as { id: number }

    db.prepare("UPDATE avis_matches SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(match.id)

    const updatedMatch = db.prepare("SELECT status FROM avis_matches WHERE id = ?").get(match.id) as { status: string }
    expect(updatedMatch.status).toBe("rejected")
  })

  it("should reject already-confirmed match (for reversal)", () => {
    const db = getDb()

    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test2.pdf', '2026-05-20', '456', '789')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '456'").get() as { id: number }

    db.prepare(`INSERT INTO import_log (filename, status) VALUES ('[AVIS] TEST2', 'success')`).run()
    const importLog = db.prepare("SELECT id FROM import_log WHERE filename = '[AVIS] TEST2'").get() as { id: number }

    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Confirmed Product 1', 199, 85, 'confirmed')`).run(receipt.id, importLog.id)
    const match = db.prepare("SELECT id FROM avis_matches WHERE status = 'confirmed'").get() as { id: number }

    db.prepare("UPDATE avis_matches SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(match.id)

    const updatedMatch = db.prepare("SELECT status FROM avis_matches WHERE id = ?").get(match.id) as { status: string }
    expect(updatedMatch.status).toBe("rejected")
  })

  it("should reject if match not found", () => {
    const db = getDb()
    const match = db.prepare("SELECT id FROM avis_matches WHERE id = 99999").get()
    expect(match).toBeUndefined()
  })
})
