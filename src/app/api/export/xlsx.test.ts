import { describe, it, expect } from "vitest"
import { GET } from "./xlsx/route"
import { NextRequest } from "next/server"

describe("Excel Export API", () => {
  // Helper to create NextRequest
  const createRequest = (url: string) => {
    return new NextRequest(new URL(url, "http://localhost:3000"))
  }

  it("should return Excel file with correct MIME type", async () => {
    const request = createRequest("http://localhost:3000/api/export/xlsx")
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    expect(response.headers.get("content-disposition")).toContain("attachment")
  })

  it("should validate date format", async () => {
    const request = createRequest("http://localhost:3000/api/export/xlsx?from=bad-date")
    const response = await GET(request)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.message).toContain("Ungültiges Datum")
  })

  it("should handle valid date range", async () => {
    const request = createRequest(
      "http://localhost:3000/api/export/xlsx?from=2026-01-01&to=2026-12-31"
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
  })

  it("should set correct filename with Excel extension", async () => {
    const request = createRequest("http://localhost:3000/api/export/xlsx")
    const response = await GET(request)

    const disposition = response.headers.get("content-disposition")
    expect(disposition).toMatch(/ebon-export-\d{4}-\d{2}-\d{2}\.xlsx/)
  })

  it("should return binary content (Buffer)", async () => {
    const request = createRequest("http://localhost:3000/api/export/xlsx")
    const response = await GET(request)

    // Response should have content
    const buffer = await response.arrayBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)

    // Excel files start with specific signature
    // XLSX files are ZIP files, starting with 'PK' (0x504B)
    const view = new Uint8Array(buffer)
    expect(view[0]).toBe(0x50) // 'P'
    expect(view[1]).toBe(0x4b) // 'K'
  })

  it("should handle useAlias parameter", async () => {
    const requestWithAlias = createRequest("http://localhost:3000/api/export/xlsx?useAlias=true")
    const responseWithAlias = await GET(requestWithAlias)
    expect(responseWithAlias.status).toBe(200)

    const requestWithoutAlias = createRequest(
      "http://localhost:3000/api/export/xlsx?useAlias=false"
    )
    const responseWithoutAlias = await GET(requestWithoutAlias)
    expect(responseWithoutAlias.status).toBe(200)
  })

  it("should set no-cache headers", async () => {
    const request = createRequest("http://localhost:3000/api/export/xlsx")
    const response = await GET(request)

    const cacheControl = response.headers.get("cache-control")
    expect(cacheControl).toContain("no-store")
    expect(cacheControl).toContain("no-cache")
  })

  it("should handle date range validation", async () => {
    const requestValid = createRequest(
      "http://localhost:3000/api/export/xlsx?from=2026-01-01&to=2026-12-31"
    )
    const responseValid = await GET(requestValid)
    expect(responseValid.status).toBe(200)

    // Invalid date formats
    const requestInvalidFrom = createRequest("http://localhost:3000/api/export/xlsx?from=01/01/2026")
    const responseInvalidFrom = await GET(requestInvalidFrom)
    expect(responseInvalidFrom.status).toBe(400)
  })

  it("should handle missing date parameters (all data)", async () => {
    const request = createRequest("http://localhost:3000/api/export/xlsx")
    const response = await GET(request)

    // Should still succeed even without dates (exports all data)
    expect(response.status).toBe(200)
  })
})
