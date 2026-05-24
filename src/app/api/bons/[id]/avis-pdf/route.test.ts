import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getDb, closeDb } from "@/lib/db"

describe("GET /api/bons/[id]/avis-pdf", () => {
  let db: ReturnType<typeof getDb>

  beforeAll(() => {
    db = getDb()
  })

  afterAll(() => {
    closeDb()
  })

  it("returns 404 when bon not found", async () => {
    const response = await fetch("http://localhost:3000/api/bons/99999/avis-pdf")
    expect(response.status).toBe(404)
  })

  it("returns 404 when bon has no AVIS matches", async () => {
    db.prepare("INSERT INTO receipts (filename, receipt_nr) VALUES (?, ?)").run(
      "test.pdf",
      "TEST-003"
    )
    const result = db
      .prepare("SELECT id FROM receipts ORDER BY id DESC LIMIT 1")
      .get() as { id: number }

    const response = await fetch(`http://localhost:3000/api/bons/${result.id}/avis-pdf`)
    expect(response.status).toBe(404)

    db.prepare("DELETE FROM receipts WHERE id = ?").run(result.id)
  })

  it("returns 404 when AVIS match has no paperless_doc_id", async () => {
    db.prepare("INSERT INTO receipts (filename, receipt_nr) VALUES (?, ?)").run(
      "test.pdf",
      "TEST-004"
    )
    const receipt = db
      .prepare("SELECT id FROM receipts ORDER BY id DESC LIMIT 1")
      .get() as { id: number }

    db.prepare(
      "INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)"
    ).run("[AVIS] TEST-ORDER", "success", "test")
    const importLog = db
      .prepare("SELECT id FROM import_log ORDER BY id DESC LIMIT 1")
      .get() as { id: number }

    db.prepare(
      `INSERT INTO avis_matches (receipt_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(receipt.id, importLog.id, "Test Item", 100, 85, "auto_set")

    const response = await fetch(`http://localhost:3000/api/bons/${receipt.id}/avis-pdf`)
    expect(response.status).toBe(404)

    db.prepare("DELETE FROM avis_matches WHERE receipt_id = ?").run(receipt.id)
    db.prepare("DELETE FROM import_log WHERE id = ?").run(importLog.id)
    db.prepare("DELETE FROM receipts WHERE id = ?").run(receipt.id)
  })

  it("returns 400 for invalid bon id", async () => {
    const response = await fetch("http://localhost:3000/api/bons/invalid/avis-pdf")
    expect(response.status).toBe(400)
  })

  it("returns 503 when Paperless not configured", async () => {
    const oldUrl = process.env.PAPERLESS_URL
    const oldToken = process.env.PAPERLESS_TOKEN

    delete process.env.PAPERLESS_URL
    delete process.env.PAPERLESS_TOKEN

    try {
      db.prepare("INSERT INTO receipts (filename, receipt_nr) VALUES (?, ?)").run(
        "test.pdf",
        "TEST-005"
      )
      const receipt = db
        .prepare("SELECT id FROM receipts ORDER BY id DESC LIMIT 1")
        .get() as { id: number }

      db.prepare(
        "INSERT INTO import_log (filename, status, message, paperless_doc_id) VALUES (?, ?, ?, ?)"
      ).run("[AVIS] TEST-ORDER", "success", "test", 123)
      const importLog = db
        .prepare("SELECT id FROM import_log ORDER BY id DESC LIMIT 1")
        .get() as { id: number }

      db.prepare(
        `INSERT INTO avis_matches (receipt_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(receipt.id, importLog.id, "Test Item", 100, 85, "auto_set")

      const response = await fetch(`http://localhost:3000/api/bons/${receipt.id}/avis-pdf`)
      expect(response.status).toBe(503)

      db.prepare("DELETE FROM avis_matches WHERE receipt_id = ?").run(receipt.id)
      db.prepare("DELETE FROM import_log WHERE id = ?").run(importLog.id)
      db.prepare("DELETE FROM receipts WHERE id = ?").run(receipt.id)
    } finally {
      process.env.PAPERLESS_URL = oldUrl
      process.env.PAPERLESS_TOKEN = oldToken
    }
  })

  it("selects best AVIS match by confidence score", async () => {
    db.prepare("INSERT INTO receipts (filename, receipt_nr) VALUES (?, ?)").run(
      "test.pdf",
      "TEST-006"
    )
    const receipt = db
      .prepare("SELECT id FROM receipts ORDER BY id DESC LIMIT 1")
      .get() as { id: number }

    // Create two import logs with different paperless_doc_ids
    db.prepare(
      "INSERT INTO import_log (filename, status, message, paperless_doc_id) VALUES (?, ?, ?, ?)"
    ).run("[AVIS] ORDER-1", "success", "test", 111)
    const importLog1 = db
      .prepare("SELECT id FROM import_log ORDER BY id DESC LIMIT 1")
      .get() as { id: number }

    db.prepare(
      "INSERT INTO import_log (filename, status, message, paperless_doc_id) VALUES (?, ?, ?, ?)"
    ).run("[AVIS] ORDER-2", "success", "test", 222)
    const importLog2 = db
      .prepare("SELECT id FROM import_log ORDER BY id DESC LIMIT 1")
      .get() as { id: number }

    // Create two matches with different confidence scores
    db.prepare(
      `INSERT INTO avis_matches (receipt_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(receipt.id, importLog1.id, "Item 1", 100, 75, "auto_set")

    db.prepare(
      `INSERT INTO avis_matches (receipt_id, import_log_id, avis_item_name, avis_unit_price_cents, confidence, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(receipt.id, importLog2.id, "Item 2", 100, 95, "auto_set")

    const bestMatch = db
      .prepare(
        `SELECT il.paperless_doc_id
         FROM avis_matches am
         INNER JOIN import_log il ON am.import_log_id = il.id
         WHERE am.receipt_id = ?
         ORDER BY am.confidence DESC
         LIMIT 1`
      )
      .get(receipt.id) as { paperless_doc_id: number | null }

    expect(bestMatch.paperless_doc_id).toBe(222)

    db.prepare("DELETE FROM avis_matches WHERE receipt_id = ?").run(receipt.id)
    db.prepare("DELETE FROM import_log WHERE id IN (?, ?)").run(importLog1.id, importLog2.id)
    db.prepare("DELETE FROM receipts WHERE id = ?").run(receipt.id)
  })
})
