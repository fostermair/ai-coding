import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { getDb, closeDb } from "@/lib/db"
import { POST as syncHandler } from "../sync/route"

describe("GET /api/bons/[id]/pdf", () => {
  let db: ReturnType<typeof getDb>

  beforeAll(() => {
    db = getDb()
  })

  afterAll(() => {
    closeDb()
  })

  it("returns 404 when bon not found", async () => {
    const response = await fetch("http://localhost:3000/api/bons/99999/pdf")
    expect(response.status).toBe(404)
  })

  it("returns 404 when bon has no paperless_doc_id", async () => {
    db.prepare("INSERT INTO receipts (filename, receipt_nr) VALUES (?, ?)").run(
      "test.pdf",
      "TEST-001"
    )
    const result = db
      .prepare("SELECT id FROM receipts ORDER BY id DESC LIMIT 1")
      .get() as { id: number }

    const response = await fetch(`http://localhost:3000/api/bons/${result.id}/pdf`)
    expect(response.status).toBe(404)

    db.prepare("DELETE FROM receipts WHERE id = ?").run(result.id)
  })

  it("returns 400 for invalid bon id", async () => {
    const response = await fetch("http://localhost:3000/api/bons/invalid/pdf")
    expect(response.status).toBe(400)
  })

  it("returns 503 when Paperless not configured", async () => {
    const oldUrl = process.env.PAPERLESS_URL
    const oldToken = process.env.PAPERLESS_TOKEN

    delete process.env.PAPERLESS_URL
    delete process.env.PAPERLESS_TOKEN

    try {
      db.prepare("INSERT INTO receipts (filename, receipt_nr, paperless_doc_id) VALUES (?, ?, ?)")
        .run("test.pdf", "TEST-002", 123)
      const result = db
        .prepare("SELECT id FROM receipts ORDER BY id DESC LIMIT 1")
        .get() as { id: number }

      const response = await fetch(`http://localhost:3000/api/bons/${result.id}/pdf`)
      expect(response.status).toBe(503)

      db.prepare("DELETE FROM receipts WHERE id = ?").run(result.id)
    } finally {
      process.env.PAPERLESS_URL = oldUrl
      process.env.PAPERLESS_TOKEN = oldToken
    }
  })
})
