import { describe, it, expect, beforeEach } from "vitest"
import { getDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

describe("PUT /api/avis/matches/[matchId]/confirm", () => {
  beforeEach(() => {
    // Fresh DB for each test
    const testDbPath = path.join(process.cwd(), "data", "test-confirm.db")
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    process.env.DB_PATH = testDbPath
  })

  it("should confirm a pending match and save alias", () => {
    const db = getDb()

    // Setup
    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test.pdf', '2026-05-19', '123', '456')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '123'").get() as { id: number }

    db.prepare(`INSERT INTO receipt_items (receipt_id, raw_name, item_type, unit_price_cents, total_price_cents)
      VALUES (?, 'TEST PRODUCT', 'product', 199, 199)`).run(receipt.id)
    const item = db.prepare("SELECT id FROM receipt_items WHERE raw_name = 'TEST PRODUCT'").get() as { id: number }

    db.prepare(`INSERT INTO import_log (filename, status) VALUES ('[AVIS] TEST1', 'success')`).run()
    const importLog = db.prepare("SELECT id FROM import_log ORDER BY id DESC LIMIT 1").get() as { id: number }

    // Insert match with unique avis_item_name
    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, ?, ?, 'Pending Product 1', 199, 75, 'pending')`).run(receipt.id, item.id, importLog.id)
    const match = db.prepare("SELECT id FROM avis_matches WHERE status = 'pending'").get() as { id: number }

    // Confirm match
    db.prepare(`UPDATE avis_matches SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`).run(match.id)

    // Save alias
    db.prepare(`INSERT INTO product_aliases (raw_name, alias, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(raw_name) DO UPDATE SET alias = excluded.alias`).run("TEST PRODUCT", "My Product Alias")

    // Verify
    const updatedMatch = db.prepare("SELECT status FROM avis_matches WHERE id = ?").get(match.id) as { status: string }
    expect(updatedMatch.status).toBe("confirmed")

    const alias = db.prepare("SELECT alias FROM product_aliases WHERE raw_name = 'TEST PRODUCT'").get() as { alias: string }
    expect(alias.alias).toBe("My Product Alias")
  })

  it("should reject if match not found", () => {
    const db = getDb()
    const match = db.prepare("SELECT id FROM avis_matches WHERE id = 99999").get()
    expect(match).toBeUndefined()
  })

  it("should reject if match status is not pending", () => {
    const db = getDb()

    // Setup with different receipt/import
    db.prepare(`INSERT INTO receipts (filename, receipt_date, receipt_nr, market_nr)
      VALUES ('test2.pdf', '2026-05-20', '456', '789')`).run()
    const receipt = db.prepare("SELECT id FROM receipts WHERE receipt_nr = '456'").get() as { id: number }

    db.prepare(`INSERT INTO import_log (filename, status) VALUES ('[AVIS] TEST2', 'success')`).run()
    const importLog = db.prepare("SELECT id FROM import_log WHERE filename = '[AVIS] TEST2'").get() as { id: number }

    // Create confirmed match
    db.prepare(`INSERT INTO avis_matches (receipt_id, receipt_item_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
      VALUES (?, NULL, ?, 'Confirmed Product 2', 199, 85, 'confirmed')`).run(receipt.id, importLog.id)

    const match = db.prepare("SELECT id, status FROM avis_matches WHERE status = 'confirmed'").get() as { id: number; status: string }
    expect(match.status).toBe("confirmed")
  })
})
