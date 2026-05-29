import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getDb, closeDb } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

describe("PROJ-33: Bestellung Merge — deduplizierte Artikelbasis aus mehreren import_log-Einträgen", () => {
  let testNum = 0

  beforeEach(() => {
    testNum++
    const testDbPath = path.join(process.cwd(), "data", `test-bestellung-merge-${testNum}.db`)
    closeDb()
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
    process.env.DB_PATH = testDbPath
  })

  afterEach(() => {
    closeDb()
    delete process.env.DB_PATH
  })

  const insertLog = (db: ReturnType<typeof getDb>, filename: string, pdfPath: string, orderDate: string, totalCents: number) => {
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO import_log (filename, status, message, pdf_path, order_date, order_total_cents) VALUES (?, 'success', '', ?, ?, ?)"
    ).run(filename, pdfPath, orderDate, totalCents)
    return lastInsertRowid as number
  }

  const insertItem = (db: ReturnType<typeof getDb>, logId: number, orderNr: string, name: string, amount: number, unit: string, unitPrice: number, totalPrice: number) => {
    db.prepare(
      `INSERT INTO bestellung_items (import_log_id, order_number, article_name, quantity_amount, quantity_unit, unit_price_cents, total_price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(logId, orderNr, name, amount, unit, unitPrice, totalPrice)
  }

  // The deduplicated query from bons/[id]/route.ts
  const mergedQuery = (db: ReturnType<typeof getDb>, orderNr: string) =>
    db.prepare(
      `SELECT MIN(id) as id, article_name, quantity_amount, quantity_unit,
              MIN(unit_price_cents) as unit_price_cents,
              MIN(total_price_cents) as total_price_cents
       FROM bestellung_items
       WHERE order_number = ?
       GROUP BY article_name, quantity_amount, quantity_unit
       ORDER BY MIN(id)`
    ).all(orderNr) as Array<{
      id: number
      article_name: string
      quantity_amount: number
      quantity_unit: string
      unit_price_cents: number
      total_price_cents: number
    }>

  it("identische Artikel aus zwei PDFs erscheinen nur einmal", () => {
    const db = getDb()
    const log1 = insertLog(db, "b1.pdf", "/data/b1.pdf", "2026-05-01", 400)
    insertItem(db, log1, "B-MERGE-01", "Milch 1L", 1, "Stück", 129, 129)
    insertItem(db, log1, "B-MERGE-01", "Butter 250g", 250, "g", 199, 199)

    const log2 = insertLog(db, "b2.pdf", "/data/b2.pdf", "2026-05-01", 400)
    insertItem(db, log2, "B-MERGE-01", "Milch 1L", 1, "Stück", 129, 129)
    insertItem(db, log2, "B-MERGE-01", "Butter 250g", 250, "g", 199, 199)

    const merged = mergedQuery(db, "B-MERGE-01")
    expect(merged).toHaveLength(2)
    expect(merged.map(m => m.article_name)).toEqual(["Milch 1L", "Butter 250g"])
  })

  it("neue Artikel aus zweitem PDF erscheinen in der zusammengeführten Liste", () => {
    const db = getDb()
    const log1 = insertLog(db, "b1.pdf", "/data/b1.pdf", "2026-05-02", 350)
    insertItem(db, log1, "B-MERGE-02", "Apfel", 1, "kg", 299, 299)

    const log2 = insertLog(db, "b2.pdf", "/data/b2.pdf", "2026-05-02", 500)
    insertItem(db, log2, "B-MERGE-02", "Apfel", 1, "kg", 299, 299)
    insertItem(db, log2, "B-MERGE-02", "Banane", 1, "kg", 189, 189)

    const merged = mergedQuery(db, "B-MERGE-02")
    expect(merged).toHaveLength(2)
    const names = merged.map(m => m.article_name)
    expect(names).toContain("Apfel")
    expect(names).toContain("Banane")
  })

  it("stornierter Artikel aus zweitem PDF bleibt in der Basis erhalten (aus erstem PDF)", () => {
    const db = getDb()
    const log1 = insertLog(db, "b1.pdf", "/data/b1.pdf", "2026-05-03", 600)
    insertItem(db, log1, "B-MERGE-03", "Joghurt 500g", 500, "g", 159, 159)
    insertItem(db, log1, "B-MERGE-03", "Käse 400g", 400, "g", 349, 349)

    // Zweites PDF hat Käse nicht mehr (storniert)
    const log2 = insertLog(db, "b2.pdf", "/data/b2.pdf", "2026-05-03", 159)
    insertItem(db, log2, "B-MERGE-03", "Joghurt 500g", 500, "g", 159, 159)

    const merged = mergedQuery(db, "B-MERGE-03")
    // Beide Artikel bleiben in der Basis
    expect(merged).toHaveLength(2)
    const names = merged.map(m => m.article_name)
    expect(names).toContain("Joghurt 500g")
    expect(names).toContain("Käse 400g")
  })

  it("erstes PDF — verhält sich wie bisher (ein Eintrag)", () => {
    const db = getDb()
    const log1 = insertLog(db, "b1.pdf", "/data/b1.pdf", "2026-05-04", 300)
    insertItem(db, log1, "B-MERGE-04", "Brot 500g", 500, "g", 299, 299)

    const merged = mergedQuery(db, "B-MERGE-04")
    expect(merged).toHaveLength(1)
    expect(merged[0].article_name).toBe("Brot 500g")
  })

  // PDF-Route: neuestes PDF via MAX(import_log_id)
  const latestPdfQuery = (db: ReturnType<typeof getDb>, orderNr: string) =>
    db.prepare(
      `SELECT il.pdf_path
       FROM import_log il
       WHERE il.id = (
         SELECT MAX(bi.import_log_id)
         FROM bestellung_items bi
         WHERE bi.order_number = ?
       )`
    ).get(orderNr) as { pdf_path: string } | undefined

  it("PDF-Route liefert das zuletzt importierte PDF", () => {
    const db = getDb()
    const log1 = insertLog(db, "b1.pdf", "/data/first.pdf", "2026-05-05", 300)
    insertItem(db, log1, "B-MERGE-05", "Artikel A", 1, "Stück", 100, 100)

    const log2 = insertLog(db, "b2.pdf", "/data/latest.pdf", "2026-05-05", 200)
    insertItem(db, log2, "B-MERGE-05", "Artikel A", 1, "Stück", 100, 100)

    const result = latestPdfQuery(db, "B-MERGE-05")
    expect(result?.pdf_path).toBe("/data/latest.pdf")
  })

  it("PDF-Route mit nur einem Eintrag — gibt das einzige PDF zurück", () => {
    const db = getDb()
    const log1 = insertLog(db, "b1.pdf", "/data/only.pdf", "2026-05-06", 300)
    insertItem(db, log1, "B-MERGE-06", "Artikel X", 1, "Stück", 100, 100)

    const result = latestPdfQuery(db, "B-MERGE-06")
    expect(result?.pdf_path).toBe("/data/only.pdf")
  })
})
