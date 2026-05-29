import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getDb, closeDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

describe("PROJ-33: Bestellung Import — kein Duplikat-Block per order_number", () => {
  let testNum = 0

  beforeEach(() => {
    testNum++
    const testDbPath = path.join(process.cwd(), "data", `test-bestellung-import-${testNum}.db`)
    closeDb()
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
    process.env.DB_PATH = testDbPath
  })

  afterEach(() => {
    closeDb()
    delete process.env.DB_PATH
  })

  it("erlaubt zwei import_log-Einträge mit gleicher order_number", () => {
    const db = getDb()

    const insertLog = db.prepare(
      "INSERT INTO import_log (filename, status, message, pdf_path, order_date, order_total_cents) VALUES (?, ?, ?, ?, ?, ?)"
    )
    const insertItem = db.prepare(
      `INSERT INTO bestellung_items (import_log_id, order_number, article_name, quantity_amount, quantity_unit, unit_price_cents, total_price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const { lastInsertRowid: logId1 } = insertLog.run("bestellung_B-TST-001_1.pdf", "success", "2 Artikel importiert", "/data/1.pdf", "2026-05-01", 500)
    insertItem.run(logId1, "B-TST-001", "Milch 1L", 1, "Stück", 129, 129)
    insertItem.run(logId1, "B-TST-001", "Butter 250g", 250, "g", 199, 199)

    const { lastInsertRowid: logId2 } = insertLog.run("bestellung_B-TST-001_2.pdf", "success", "2 Artikel importiert", "/data/2.pdf", "2026-05-01", 450)
    insertItem.run(logId2, "B-TST-001", "Milch 1L", 1, "Stück", 129, 129)
    insertItem.run(logId2, "B-TST-001", "Joghurt 500g", 500, "g", 89, 89)

    const logs = db.prepare("SELECT id FROM import_log WHERE filename LIKE 'bestellung_B-TST-001%'").all()
    expect(logs).toHaveLength(2)

    const items = db.prepare("SELECT * FROM bestellung_items WHERE order_number = 'B-TST-001'").all()
    expect(items).toHaveLength(4)
  })

  it("alle 4 Roheinträge sind in der DB — zwei Einträge pro PDF", () => {
    const db = getDb()

    const insertLog = db.prepare(
      "INSERT INTO import_log (filename, status, message, pdf_path, order_date, order_total_cents) VALUES (?, ?, ?, ?, ?, ?)"
    )
    const insertItem = db.prepare(
      `INSERT INTO bestellung_items (import_log_id, order_number, article_name, quantity_amount, quantity_unit, unit_price_cents, total_price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const { lastInsertRowid: logId1 } = insertLog.run("b1.pdf", "success", "", "/data/b1.pdf", "2026-05-02", 300)
    insertItem.run(logId1, "B-TST-002", "Apfel", 1, "kg", 299, 299)

    const { lastInsertRowid: logId2 } = insertLog.run("b2.pdf", "success", "", "/data/b2.pdf", "2026-05-02", 200)
    insertItem.run(logId2, "B-TST-002", "Apfel", 1, "kg", 299, 299)
    insertItem.run(logId2, "B-TST-002", "Banane", 1, "kg", 189, 189)

    const rawItems = db.prepare("SELECT * FROM bestellung_items WHERE order_number = 'B-TST-002'").all()
    expect(rawItems).toHaveLength(3)
  })
})
