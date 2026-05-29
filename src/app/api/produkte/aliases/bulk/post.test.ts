import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { POST } from "./route"
import { NextRequest } from "next/server"
import { getDb } from "@/lib/db"

describe("POST /api/produkte/aliases/bulk", () => {
  const db = getDb()

  beforeEach(() => {
    db.prepare("DELETE FROM product_aliases").run()
  })

  afterEach(() => {
    db.prepare("DELETE FROM product_aliases").run()
  })

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost:3000/api/produkte/aliases/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("saves multiple aliases atomically and returns saved count", async () => {
    const request = makeRequest({
      items: [
        { raw_name: "BUTTER 250G", alias: "Butter", source: "suggested" },
        { raw_name: "MILCH 1L", alias: "Milch", source: "manual" },
        { raw_name: "JOGHURT NAT", alias: "Joghurt Natur", source: "avis" },
      ],
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.saved).toBe(3)

    const count = (db.prepare("SELECT COUNT(*) as c FROM product_aliases").get() as any).c
    expect(count).toBe(3)
  })

  it("stores source field correctly", async () => {
    const request = makeRequest({
      items: [{ raw_name: "BUTTER 250G", alias: "Butter", source: "suggested" }],
    })
    await POST(request)

    const row = db
      .prepare("SELECT source FROM product_aliases WHERE raw_name = ?")
      .get("BUTTER 250G") as any
    expect(row.source).toBe("suggested")
  })

  it("is idempotent — ON CONFLICT DO NOTHING does not overwrite existing alias", async () => {
    db.prepare(
      "INSERT INTO product_aliases (raw_name, alias, source, updated_at) VALUES (?, ?, ?, datetime('now'))"
    ).run("BUTTER 250G", "Existing Alias", "manual")

    const request = makeRequest({
      items: [{ raw_name: "BUTTER 250G", alias: "New Alias", source: "suggested" }],
    })
    const response = await POST(request)
    const data = await response.json()

    expect(data.saved).toBe(0) // conflict, nothing written

    const row = db
      .prepare("SELECT alias FROM product_aliases WHERE raw_name = ?")
      .get("BUTTER 250G") as any
    expect(row.alias).toBe("Existing Alias") // unchanged
  })

  it("returns 400 when items array is empty", async () => {
    const request = makeRequest({ items: [] })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("returns 400 when items key is missing", async () => {
    const request = makeRequest({})
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("returns 400 for invalid source value", async () => {
    const request = makeRequest({
      items: [{ raw_name: "PROD", alias: "Alias", source: "invalid" }],
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("returns 400 when alias is empty string", async () => {
    const request = makeRequest({
      items: [{ raw_name: "PROD", alias: "   ", source: "manual" }],
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("returns 400 when raw_name is empty string", async () => {
    const request = makeRequest({
      items: [{ raw_name: "   ", alias: "Some Alias", source: "manual" }],
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("trims whitespace from raw_name and alias before saving", async () => {
    const request = makeRequest({
      items: [{ raw_name: "  BUTTER 250G  ", alias: "  Butter  ", source: "manual" }],
    })
    const response = await POST(request)
    expect(response.status).toBe(200)

    const row = db
      .prepare("SELECT raw_name, alias FROM product_aliases WHERE raw_name = ?")
      .get("BUTTER 250G") as any
    expect(row.raw_name).toBe("BUTTER 250G")
    expect(row.alias).toBe("Butter")
  })

  it("saves 100 items in a single transaction", async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      raw_name: `PROD_${i}`,
      alias: `Alias ${i}`,
      source: "suggested" as const,
    }))

    const request = makeRequest({ items })
    const response = await POST(request)
    const data = await response.json()

    expect(data.saved).toBe(100)

    const count = (db.prepare("SELECT COUNT(*) as c FROM product_aliases").get() as any).c
    expect(count).toBe(100)
  })
})
