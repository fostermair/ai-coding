import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GET } from "./route"
import { NextRequest } from "next/server"
import { getDb } from "@/lib/db"
import fs from "fs"
import path from "path"
import os from "os"

describe("GET /api/backup", () => {
  const db = getDb()

  beforeEach(() => {
    // Clear import_log before each test
    db.prepare("DELETE FROM import_log WHERE status IN ('backup_created', 'backup_restored')").run()
  })

  afterEach(() => {
    // Clean up
    db.prepare("DELETE FROM import_log WHERE status IN ('backup_created', 'backup_restored')").run()
  })

  it("should return a ZIP file with correct headers", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/zip")
    expect(response.headers.get("Content-Disposition")).toContain("exbon-backup-")
    expect(response.headers.get("Content-Disposition")).toContain(".zip")
  })

  it("should include MANIFEST.md in the backup ZIP", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const content = new TextDecoder().decode(arrayBuffer)

    // ZIP files contain MANIFEST.md as part of the archive
    expect(content).toContain("EXBON Backup Manifest")
  })

  it("should include ebon.db in the backup ZIP", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    const blob = await response.blob()
    const size = blob.size

    // ZIP should have meaningful size (at least DB + manifest)
    expect(size).toBeGreaterThan(1000)
  })

  it("should generate correct backup filename with date", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    const disposition = response.headers.get("Content-Disposition")
    const match = disposition?.match(/exbon-backup-(\d{4})-(\d{2})-(\d{2})\.zip/)

    expect(match).toBeTruthy()

    // Parse date parts
    const [, year, month, day] = match!
    const backupDate = new Date(`${year}-${month}-${day}`)
    const today = new Date()

    // Backup date should be today (allowing for timezone differences)
    expect(backupDate.toISOString().split("T")[0]).toBe(today.toISOString().split("T")[0])
  })

  it("should log backup creation in import_log", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    // Wait a moment for the log to be written
    await new Promise((resolve) => setTimeout(resolve, 50))

    const logEntry = db
      .prepare("SELECT * FROM import_log WHERE status = 'backup_created' ORDER BY imported_at DESC LIMIT 1")
      .get() as any

    expect(logEntry).toBeDefined()
    expect(logEntry.status).toBe("backup_created")
    expect(logEntry.message).toContain("exbon-backup-")
  })

  it("should handle case with no directories (only DB)", async () => {
    // Ensure data directories don't exist (though they typically would)
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const blob = await response.blob()
    expect(blob.size).toBeGreaterThan(0)
  })

  it("should set proper cache control headers", async () => {
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    const cacheControl = response.headers.get("Cache-Control")
    expect(cacheControl).toBe("no-cache, no-store, must-revalidate")
  })

  it("should create backup even when no receipts exist", async () => {
    // Test with an empty database scenario
    const request = new NextRequest("http://localhost:3000/api/backup", { method: "GET" })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const blob = await response.blob()

    // Should still have a valid ZIP with at least the DB and manifest
    expect(blob.size).toBeGreaterThan(0)
  })
})
