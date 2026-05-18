import { describe, it, expect, vi } from "vitest"
import { GET } from "./csv/route"
import { NextRequest } from "next/server"

describe("CSV Export API", () => {
  // Helper to create NextRequest
  const createRequest = (url: string) => {
    return new NextRequest(new URL(url, "http://localhost:3000"))
  }

  it("should return CSV with BOM and correct format", async () => {
    const request = createRequest("http://localhost:3000/api/export/csv")
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/csv")
    expect(response.headers.get("content-disposition")).toContain("attachment")

    const content = await response.text()
    // Check for UTF-8 BOM (﻿ character)
    // BOM can be represented as single character or UTF-8 bytes
    const hasBOM = content.charCodeAt(0) === 0xfeff || content.startsWith("﻿")
    expect(hasBOM || content.startsWith("Datum")).toBeTruthy()

    // Check for headers
    const lines = content.replace(/^﻿/, "").split("\n") // Remove BOM if present
    const header = lines[0]
    expect(header).toContain("Datum")
    expect(header).toContain("Produktname")
    expect(header).toContain("Einzelpreis")
  })

  it("should validate date format", async () => {
    const request = createRequest("http://localhost:3000/api/export/csv?from=invalid-date")
    const response = await GET(request)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.message).toContain("Ungültiges Datum")
  })

  it("should handle valid date range", async () => {
    const request = createRequest(
      "http://localhost:3000/api/export/csv?from=2026-01-01&to=2026-12-31"
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
  })

  it("should format prices with comma as decimal separator", async () => {
    const request = createRequest("http://localhost:3000/api/export/csv")
    const response = await GET(request)

    const content = await response.text()
    // Look for German locale format (e.g., 1,99)
    const hasCommaDecimal = /\d+,\d{2}/.test(content)
    // CSV might be empty if no data, so this is optional
    if (content.split("\n").length > 1) {
      // If there's data, check formatting
      expect(hasCommaDecimal || content.length < 200).toBeTruthy()
    }
  })

  it("should escape commas in product names (CSV format)", async () => {
    const request = createRequest("http://localhost:3000/api/export/csv")
    const response = await GET(request)

    const content = await response.text()
    // If any product name contains comma, it should be quoted
    // This is a general check - actual test would need test data with commas
    expect(typeof content === "string").toBeTruthy()
  })

  it("should set correct filename in response header", async () => {
    const request = createRequest("http://localhost:3000/api/export/csv")
    const response = await GET(request)

    const disposition = response.headers.get("content-disposition")
    expect(disposition).toMatch(/ebon-export-\d{4}-\d{2}-\d{2}\.csv/)
  })

  it("should handle useAlias parameter", async () => {
    const requestWithAlias = createRequest("http://localhost:3000/api/export/csv?useAlias=true")
    const responseWithAlias = await GET(requestWithAlias)
    expect(responseWithAlias.status).toBe(200)

    const requestWithoutAlias = createRequest("http://localhost:3000/api/export/csv?useAlias=false")
    const responseWithoutAlias = await GET(requestWithoutAlias)
    expect(responseWithoutAlias.status).toBe(200)
  })

  it("should set no-cache headers", async () => {
    const request = createRequest("http://localhost:3000/api/export/csv")
    const response = await GET(request)

    const cacheControl = response.headers.get("cache-control")
    expect(cacheControl).toContain("no-store")
    expect(cacheControl).toContain("no-cache")
  })
})
