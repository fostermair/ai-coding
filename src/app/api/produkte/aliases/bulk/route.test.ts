import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { DELETE } from "./route"
import { NextRequest } from "next/server"
import { getDb } from "@/lib/db"

describe("DELETE /api/produkte/aliases/bulk", () => {
  const db = getDb()

  beforeEach(() => {
    // Clear tables
    db.prepare("DELETE FROM product_aliases").run()
  })

  afterEach(() => {
    // Clean up
    db.prepare("DELETE FROM product_aliases").run()
  })

  it("should delete all product aliases", async () => {
    // Setup: Create multiple aliases
    db.prepare("INSERT INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))")
      .run("PROD1", "Alias 1")
    db.prepare("INSERT INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))")
      .run("PROD2", "Alias 2")
    db.prepare("INSERT INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))")
      .run("PROD3", "Alias 3")

    // Verify setup
    let count = (db.prepare("SELECT COUNT(*) as count FROM product_aliases").get() as any).count
    expect(count).toBe(3)

    // Execute DELETE
    const request = new NextRequest("http://localhost:3000/api/produkte/aliases/bulk", { method: "DELETE" })
    const response = await DELETE(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.count).toBe(3)
    expect(data.message).toContain("3 Einträge zurückgesetzt")

    // Verify all aliases are deleted
    count = (db.prepare("SELECT COUNT(*) as count FROM product_aliases").get() as any).count
    expect(count).toBe(0)
  })

  it("should return 0 count when no aliases exist", async () => {
    const request = new NextRequest("http://localhost:3000/api/produkte/aliases/bulk", { method: "DELETE" })
    const response = await DELETE(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.count).toBe(0)
    expect(data.message).toContain("Keine Alias zum Löschen")
  })

  it("should handle single alias deletion", async () => {
    // Setup: Create one alias
    db.prepare("INSERT INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))")
      .run("SINGLE_PROD", "Single Alias")

    // Execute DELETE
    const request = new NextRequest("http://localhost:3000/api/produkte/aliases/bulk", { method: "DELETE" })
    const response = await DELETE(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.count).toBe(1)
    expect(data.message).toContain("1 Einträge zurückgesetzt")

    // Verify alias is deleted
    const remaining = (db.prepare("SELECT COUNT(*) as count FROM product_aliases").get() as any).count
    expect(remaining).toBe(0)
  })

  it("should maintain transaction integrity with many aliases", async () => {
    // Setup: Create many aliases
    for (let i = 0; i < 100; i++) {
      db.prepare("INSERT INTO product_aliases (raw_name, alias, updated_at) VALUES (?, ?, datetime('now'))")
        .run(`PROD${i}`, `Alias ${i}`)
    }

    // Verify setup
    let count = (db.prepare("SELECT COUNT(*) as count FROM product_aliases").get() as any).count
    expect(count).toBe(100)

    // Execute DELETE
    const request = new NextRequest("http://localhost:3000/api/produkte/aliases/bulk", { method: "DELETE" })
    const response = await DELETE(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.count).toBe(100)

    // Verify all are deleted
    count = (db.prepare("SELECT COUNT(*) as count FROM product_aliases").get() as any).count
    expect(count).toBe(0)
  })
})
