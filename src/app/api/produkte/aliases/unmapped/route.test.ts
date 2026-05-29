import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET } from "./route"
import { getDb } from "@/lib/db"

// Use a unique prefix so we only touch test-specific rows
const PREFIX = "UTEST47_"

describe("GET /api/produkte/aliases/unmapped", () => {
  const db = getDb()
  let receiptIds: number[] = []

  beforeEach(() => {
    receiptIds = []
    // Clean test aliases from previous runs
    db.prepare(`DELETE FROM product_aliases WHERE raw_name LIKE '${PREFIX}%'`).run()
  })

  afterEach(() => {
    // Delete test receipts by tracked ID (avoids FK issues with bank_transactions)
    if (receiptIds.length > 0) {
      for (const id of receiptIds) {
        db.prepare("DELETE FROM receipt_items WHERE receipt_id = ?").run(id)
        db.prepare("UPDATE receipts SET bank_transaction_id = NULL WHERE id = ?").run(id)
        db.prepare("DELETE FROM receipts WHERE id = ?").run(id)
      }
    }
    db.prepare(`DELETE FROM product_aliases WHERE raw_name LIKE '${PREFIX}%'`).run()
    receiptIds = []
  })

  function insertReceipt(date: string): number {
    const result = db
      .prepare(
        `INSERT INTO receipts (filename, store_name, receipt_date, imported_at)
         VALUES (?, 'REWE', ?, datetime('now'))`
      )
      .run(`${PREFIX}test_${Date.now()}.pdf`, date)
    const id = result.lastInsertRowid as number
    receiptIds.push(id)
    return id
  }

  function insertItem(receiptId: number, rawName: string, priceCents = 199) {
    db.prepare(
      `INSERT INTO receipt_items (receipt_id, raw_name, unit_price_cents, total_price_cents)
       VALUES (?, ?, ?, ?)`
    ).run(receiptId, rawName, priceCents, priceCents)
  }

  function insertAlias(rawName: string, alias: string) {
    db.prepare(
      `INSERT OR REPLACE INTO product_aliases (raw_name, alias, updated_at)
       VALUES (?, ?, datetime('now'))`
    ).run(rawName, alias)
  }

  async function getTestItems() {
    const response = await GET()
    const data = await response.json()
    // Only look at items with our test prefix to stay isolated from real DB data
    return (data.items as Array<{ raw_name: string; purchase_count: number; last_bon_date: string; suggestion: string | null; confidence: number }>)
      .filter((i) => i.raw_name.startsWith(PREFIX))
  }

  it("returns empty list when all test products are aliased", async () => {
    const rid = insertReceipt("2025-01-15")
    const rawName = `${PREFIX}BUTTER_250G`
    insertItem(rid, rawName)
    insertAlias(rawName, "Butter")

    const items = await getTestItems()
    expect(items).toHaveLength(0)
  })

  it("returns unaliased products sorted by purchase_count DESC", async () => {
    const r1 = insertReceipt("2025-01-10")
    const r2 = insertReceipt("2025-01-11")
    const r3 = insertReceipt("2025-01-12")
    const milch = `${PREFIX}MILCH_1L`
    const butter = `${PREFIX}BUTTER_250G`

    // MILCH appears 3 times, BUTTER once
    insertItem(r1, milch)
    insertItem(r2, milch)
    insertItem(r3, milch)
    insertItem(r1, butter)

    const items = await getTestItems()
    expect(items.length).toBeGreaterThanOrEqual(2)
    // MILCH should come before BUTTER (higher count)
    const milchIdx = items.findIndex((i) => i.raw_name === milch)
    const butterIdx = items.findIndex((i) => i.raw_name === butter)
    expect(milchIdx).toBeLessThan(butterIdx)
    expect(items[milchIdx].purchase_count).toBe(3)
    expect(items[butterIdx].purchase_count).toBe(1)
  })

  it("returns correct last_bon_date from receipt_date column", async () => {
    const r1 = insertReceipt("2025-01-10")
    const r2 = insertReceipt("2025-03-20")
    const rawName = `${PREFIX}MILCH_1L`
    insertItem(r1, rawName)
    insertItem(r2, rawName)

    const items = await getTestItems()
    const item = items.find((i) => i.raw_name === rawName)
    expect(item).toBeDefined()
    expect(item!.last_bon_date).toBe("2025-03-20")
  })

  it("excludes products that already have a non-empty alias", async () => {
    const rid = insertReceipt("2025-01-15")
    const butter = `${PREFIX}BUTTER_250G`
    const milch = `${PREFIX}MILCH_1L`
    insertItem(rid, butter)
    insertItem(rid, milch)
    insertAlias(butter, "Butter")

    const items = await getTestItems()
    expect(items.some((i) => i.raw_name === butter)).toBe(false)
    expect(items.some((i) => i.raw_name === milch)).toBe(true)
  })

  it("includes products with empty alias string as unmapped", async () => {
    const rid = insertReceipt("2025-01-15")
    const rawName = `${PREFIX}LEER_ALIAS`
    insertItem(rid, rawName)
    db.prepare(
      `INSERT OR REPLACE INTO product_aliases (raw_name, alias, updated_at) VALUES (?, '', datetime('now'))`
    ).run(rawName)

    const items = await getTestItems()
    expect(items.some((i) => i.raw_name === rawName)).toBe(true)
  })

  it("includes suggestion and confidence fields in each item", async () => {
    const rid = insertReceipt("2025-01-15")
    const rawName = `${PREFIX}BUTTER_250G`
    insertItem(rid, rawName)

    const items = await getTestItems()
    const item = items.find((i) => i.raw_name === rawName)
    expect(item).toBeDefined()
    expect(item).toHaveProperty("suggestion")
    expect(item).toHaveProperty("confidence")
    expect(typeof item!.confidence).toBe("number")
  })

  it("returns suggestion: null and confidence: 0 when no aliases exist to compare", async () => {
    // Clean all aliases first
    db.prepare("DELETE FROM product_aliases").run()
    const rid = insertReceipt("2025-01-15")
    const rawName = `${PREFIX}UNIQUE_PRODUKT_XYZ`
    insertItem(rid, rawName)

    const items = await getTestItems()
    const item = items.find((i) => i.raw_name === rawName)
    expect(item).toBeDefined()
    expect(item!.suggestion).toBeNull()
    expect(item!.confidence).toBe(0)
  })
})
