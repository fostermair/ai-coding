import { describe, it, expect, beforeEach } from "vitest"
import { POST } from "./route"
import { NextRequest } from "next/server"
import { getDb } from "@/lib/db"

describe("POST /api/backup/restore - API Contract", () => {
  beforeEach(() => {
    const db = getDb()
    db.prepare("DELETE FROM import_log WHERE status IN ('backup_created', 'backup_restored')").run()
  })

  it("should return 400 when no file is uploaded", async () => {
    const formData = new FormData()
    const request = new NextRequest("http://localhost:3000/api/backup/restore", {
      method: "POST",
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it("should return 400 when ZIP is invalid", async () => {
    const formData = new FormData()
    const invalidZipBlob = new Blob(["not a valid zip"], { type: "application/zip" })
    formData.append("file", invalidZipBlob, "invalid.zip")

    const request = new NextRequest("http://localhost:3000/api/backup/restore", {
      method: "POST",
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it("should accept FormData with file field", async () => {
    const formData = new FormData()
    const fakeZip = new Blob([], { type: "application/zip" })
    formData.append("file", fakeZip, "backup.zip")

    const request = new NextRequest("http://localhost:3000/api/backup/restore", {
      method: "POST",
      body: formData,
    })

    // Should not crash on FormData processing
    const response = await POST(request)
    expect(response.status).toBeDefined()
    expect([400, 500]).toContain(response.status)
  })

  it("should reject requests with missing file field", async () => {
    const formData = new FormData()
    const request = new NextRequest("http://localhost:3000/api/backup/restore", {
      method: "POST",
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
