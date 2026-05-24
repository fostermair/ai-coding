import { describe, it, expect, beforeEach } from "vitest"
import { GET } from "./route"
import { NextRequest } from "next/server"
import { getDb } from "@/lib/db"

describe("GET /api/backup - API Contract", () => {
  beforeEach(() => {
    const db = getDb()
    db.prepare("DELETE FROM import_log WHERE status IN ('backup_created', 'backup_restored')").run()
  })

  it("should return ZIP response with correct headers", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/zip")
    expect(response.headers.get("Content-Disposition")).toContain("exbon-backup-")
    expect(response.headers.get("Content-Disposition")).toContain(".zip")
  }, { timeout: 15000 })

  it("should generate filename in YYYY-MM-DD format", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    const disposition = response.headers.get("Content-Disposition")
    expect(disposition).toMatch(/exbon-backup-\d{4}-\d{2}-\d{2}\.zip/)
  }, { timeout: 15000 })

  it("should have response body as blob", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    const blob = await response.blob()
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe("application/zip")
  }, { timeout: 15000 })

  it("should log backup creation", async () => {
    const db = getDb()
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    // Wait briefly for async logging
    await new Promise((resolve) => setTimeout(resolve, 100))

    const logEntry = db
      .prepare("SELECT * FROM import_log WHERE status = 'backup_created' ORDER BY imported_at DESC LIMIT 1")
      .get() as any

    expect(logEntry).toBeDefined()
    if (logEntry) {
      expect(logEntry.status).toBe("backup_created")
      expect(logEntry.message).toContain("exbon-backup-")
    }
  }, { timeout: 15000 })
})
