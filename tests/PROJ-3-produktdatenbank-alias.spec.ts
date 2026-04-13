import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"

const EBON_DIR = path.join(process.cwd(), "data", "ebons")
const EBON1 = path.join(EBON_DIR, "REWE-ebon1.pdf")
const EBON2 = path.join(EBON_DIR, "REWE-ebon2.pdf")
const EBON3 = path.join(EBON_DIR, "REWE-eBon3.pdf")

// ── Helpers ─────────────────────────────────────────────────────────────────

async function importPdf(request: import("@playwright/test").APIRequestContext, pdfPath: string) {
  const pdfBuffer = fs.readFileSync(pdfPath)
  const filename = path.basename(pdfPath)
  await request.post("/api/import", {
    multipart: {
      file: { name: filename, mimeType: "application/pdf", buffer: pdfBuffer },
    },
  })
}

async function ensureBonsImported(request: import("@playwright/test").APIRequestContext) {
  await importPdf(request, EBON1)
  await importPdf(request, EBON2)
  await importPdf(request, EBON3)
}

// ── AC: Produktseite zeigt alle eindeutigen Produkte ────────────────────────

test.describe("AC: Produktliste", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("product page shows all unique products in a table", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.getByRole("heading", { name: "Produktdatenbank" })).toBeVisible()
    // Table should have at least one product row
    const rows = page.locator("table tbody tr")
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test("each product row shows raw name and purchase count", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    const firstRow = page.locator("table tbody tr").first()
    await expect(firstRow.locator("td").nth(0)).not.toBeEmpty()
    // Purchase count column contains "×"
    await expect(firstRow.getByText(/\d+×/)).toBeVisible()
  })

  test("desktop shows price and date columns", async ({ page, browserName }) => {
    // Skip on mobile viewports
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Columns hidden on mobile")
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    const firstRow = page.locator("table tbody tr").first()
    await expect(firstRow.getByText(/\d+,\d{2}\s*€/)).toBeVisible()
    await expect(firstRow.getByText(/\d{2}\.\d{2}\.\d{4}/)).toBeVisible()
  })

  test("summary header shows total product count", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.getByText("Produkte").first()).toBeVisible({ timeout: 10000 })
  })
})

// ── AC: Produktsuche filtert in Echtzeit ────────────────────────────────────

test.describe("AC: Produktsuche", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("search filters products in real time", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const totalBefore = await page.locator("table tbody tr").count()

    // Type a search term that likely matches only some products
    await page.getByPlaceholder("Produkt suchen").fill("PFAND")
    // Wait for debounced search to trigger
    await page.waitForResponse((res) => res.url().includes("/api/produkte") && res.status() === 200)

    // Should show fewer results or empty
    // (PFAND items are filtered out as item_type = 'pfand', not 'product')
    const totalAfter = await page.locator("table tbody tr").count()
    // Either fewer results or the empty state shows
    const emptyMessage = page.getByText(/Kein Produkt/)
    const hasEmpty = await emptyMessage.isVisible().catch(() => false)
    expect(totalAfter < totalBefore || hasEmpty).toBeTruthy()
  })

  test("search empty state shows message and reset button", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder("Produkt suchen").fill("XXXXXXXXNOTEXIST")
    await page.waitForResponse((res) => res.url().includes("/api/produkte") && res.status() === 200)

    await expect(page.getByText(/Kein Produkt/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Suche zurücksetzen")).toBeVisible()
  })

  test("search reset clears filter", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder("Produkt suchen").fill("XXXXXXXXNOTEXIST")
    await page.waitForResponse((res) => res.url().includes("/api/produkte") && res.status() === 200)
    await expect(page.getByText("Suche zurücksetzen")).toBeVisible()

    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/produkte") && res.status() === 200),
      page.getByText("Suche zurücksetzen").click(),
    ])

    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5000 })
  })
})

// ── AC: Sortierung ─────────────────────────────────────────────────────────

test.describe("AC: Sortierung", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("sort buttons are visible and change sort order", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // All 3 sort buttons visible
    await expect(page.getByRole("button", { name: "Häufigkeit" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Name A/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "Letzter Kauf" })).toBeVisible()

    // Click "Name A–Z" and verify response
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("sort=name") && res.status() === 200),
      page.getByRole("button", { name: /Name A/ }).click(),
    ])
    await expect(page.locator("table tbody tr").first()).toBeVisible()
  })

  test("sort by last purchase triggers API call with correct param", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("sort=last_purchase") && res.status() === 200),
      page.getByRole("button", { name: "Letzter Kauf" }).click(),
    ])
    expect(response.status()).toBe(200)
  })
})

// ── AC: Alias CRUD (serial — these tests modify shared alias state) ────────

test.describe("AC: Alias CRUD", () => {
  // Must run serially: parallel workers would race on alias create/delete
  test.describe.configure({ mode: "serial" })
  // Alias column is hidden on mobile (< 640px) — skip entirely
  test.skip(({ browserName }) => browserName === "webkit", "Alias column hidden on mobile viewport")

  test.beforeAll(async ({ request }) => {
    await ensureBonsImported(request)
    // Clean up all aliases before the suite
    const resp = await request.get("/api/produkte?sort=frequency")
    const body = await resp.json()
    for (const p of body.products) {
      if (p.alias) {
        await request.delete(`/api/produkte/${encodeURIComponent(p.raw_name)}/alias`)
      }
    }
  })

  test("clicking 'Alias setzen' opens inline edit input", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    await page.getByText("Alias setzen").first().click()
    await expect(page.getByPlaceholder("Alias eingeben")).toBeVisible()
  })

  test("Escape cancels editing without saving", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    await page.getByText("Alias setzen").first().click()
    const input = page.getByPlaceholder("Alias eingeben")
    await input.fill("Should Not Save")
    await input.press("Escape")

    await expect(input).not.toBeVisible()
    await expect(page.getByText("Should Not Save")).not.toBeVisible()
    await expect(page.getByText("Alias setzen").first()).toBeVisible()
  })

  test("alias can be saved via Enter key", async ({ page, request }) => {
    // Clean aliases before this test
    const resp = await request.get("/api/produkte?sort=frequency")
    const body = await resp.json()
    for (const p of body.products) {
      if (p.alias) {
        await request.delete(`/api/produkte/${encodeURIComponent(p.raw_name)}/alias`)
      }
    }

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    await page.getByText("Alias setzen").first().click()
    const input = page.getByPlaceholder("Alias eingeben")
    await expect(input).toBeVisible()

    await input.fill("Mein Testprodukt")
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/produkte") && !res.url().includes("/alias") && res.status() === 200),
      input.press("Enter"),
    ])

    await expect(page.getByText("Mein Testprodukt")).toBeVisible({ timeout: 5000 })
  })

  test("alias can be saved via check button", async ({ page, request }) => {
    // Clean aliases before this test
    const resp = await request.get("/api/produkte?sort=frequency")
    const body = await resp.json()
    for (const p of body.products) {
      if (p.alias) {
        await request.delete(`/api/produkte/${encodeURIComponent(p.raw_name)}/alias`)
      }
    }

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    await page.getByText("Alias setzen").first().click()
    const input = page.getByPlaceholder("Alias eingeben")
    await input.fill("Test Alias Button")

    const checkButton = page.locator("table tbody tr").first().locator("button").filter({ has: page.locator("svg.lucide-check") })
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/produkte") && !res.url().includes("/alias") && res.status() === 200),
      checkButton.click(),
    ])

    await expect(page.getByText("Test Alias Button")).toBeVisible({ timeout: 5000 })
  })

  test("alias can be deleted via trash icon", async ({ page, request }) => {
    // Ensure there's an alias to delete
    const resp = await request.get("/api/produkte?sort=frequency")
    const body = await resp.json()
    const rawName = body.products[0].raw_name
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "Löschbarer Alias" },
    })

    await page.goto("/produkte")
    await expect(page.getByText("Löschbarer Alias")).toBeVisible({ timeout: 10000 })

    const aliasRow = page.locator("table tbody tr").filter({ hasText: "Löschbarer Alias" })
    await aliasRow.hover()

    const trashButton = aliasRow.locator("button").filter({ has: page.locator("svg.lucide-trash-2") })
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/produkte") && !res.url().includes("/alias") && res.status() === 200),
      trashButton.click(),
    ])

    await expect(page.getByText("Löschbarer Alias")).not.toBeVisible({ timeout: 5000 })
  })

  test("alias persists after page reload", async ({ page, request }) => {
    const prodResp = await request.get("/api/produkte?sort=frequency")
    const prodBody = await prodResp.json()
    const rawName = prodBody.products[0].raw_name
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "Persistenz-Test" },
    })

    await page.goto("/produkte")
    await expect(page.getByText("Persistenz-Test")).toBeVisible({ timeout: 10000 })

    await page.reload()
    await expect(page.getByText("Persistenz-Test")).toBeVisible({ timeout: 10000 })

    await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
  })

  test("alias appears in bon detail view", async ({ page, request }) => {
    const listResp = await request.get("/api/bons")
    const listBody = await listResp.json()
    const bonId = listBody.bons[0].id

    const detailResp = await request.get(`/api/bons/${bonId}`)
    const detailBody = await detailResp.json()
    const productItem = detailBody.items.find(
      (i: { item_type: string }) => i.item_type === "product"
    )
    if (!productItem) return

    const rawName = productItem.raw_name
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "Sichtbar im Bon" },
    })

    await page.goto(`/bon/${bonId}`)
    await expect(page.getByText("Sichtbar im Bon")).toBeVisible({ timeout: 10000 })

    await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
  })
})

// ── API direct tests ───────────────────────────────────────────────────────

test.describe("AC: API /api/produkte", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/produkte returns products with correct structure", async ({ request }) => {
    const resp = await request.get("/api/produkte?sort=frequency")
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.products).toBeDefined()
    expect(body.total_count).toBeGreaterThanOrEqual(1)
    const p = body.products[0]
    expect(p.raw_name).toBeTruthy()
    expect(p.purchase_count).toBeGreaterThanOrEqual(1)
    expect(typeof p.last_price_cents).toBe("number")
    expect(p.last_purchase_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("GET /api/produkte?sort=invalid returns 400", async ({ request }) => {
    const resp = await request.get("/api/produkte?sort=INVALID")
    expect(resp.status()).toBe(400)
  })

  test("GET /api/produkte?q=NONEXISTENT returns empty list", async ({ request }) => {
    const resp = await request.get("/api/produkte?q=ZZZNOTEXIST999")
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.products).toHaveLength(0)
  })

  test("PUT /api/produkte/[name]/alias sets alias", async ({ request }) => {
    const prodResp = await request.get("/api/produkte?sort=frequency")
    const rawName = (await prodResp.json()).products[0].raw_name

    const resp = await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "API Test Alias" },
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.alias).toBe("API Test Alias")

    // Cleanup
    await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
  })

  test("PUT /api/produkte/[name]/alias rejects empty alias", async ({ request }) => {
    const prodResp = await request.get("/api/produkte?sort=frequency")
    const rawName = (await prodResp.json()).products[0].raw_name

    const resp = await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "" },
    })
    expect(resp.status()).toBe(400)
  })

  test("PUT /api/produkte/[name]/alias rejects alias > 200 chars", async ({ request }) => {
    const prodResp = await request.get("/api/produkte?sort=frequency")
    const rawName = (await prodResp.json()).products[0].raw_name

    const resp = await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "A".repeat(201) },
    })
    expect(resp.status()).toBe(400)
  })

  test("PUT /api/produkte/NONEXISTENT/alias returns 404", async ({ request }) => {
    const resp = await request.put("/api/produkte/ZZZZNOTEXIST999/alias", {
      data: { alias: "Test" },
    })
    expect(resp.status()).toBe(404)
  })

  test("DELETE /api/produkte/[name]/alias removes alias", async ({ request }) => {
    const prodResp = await request.get("/api/produkte?sort=frequency")
    const rawName = (await prodResp.json()).products[0].raw_name

    // Set alias first
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "To Be Deleted" },
    })
    // Delete it
    const resp = await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
    expect(resp.status()).toBe(200)

    // Verify it's gone
    const checkResp = await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
    expect(checkResp.status()).toBe(404)
  })

  test("DELETE /api/produkte/NONEXISTENT/alias returns 404", async ({ request }) => {
    const resp = await request.delete("/api/produkte/ZZZZNOTEXIST999/alias")
    expect(resp.status()).toBe(404)
  })
})

// ── Security: Input validation ─────────────────────────────────────────────

test.describe("Security: Input validation", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("SQL injection via search param is harmless", async ({ request }) => {
    const resp = await request.get("/api/produkte?q=' OR 1=1 --")
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    // Should not return all products — injection should be treated as literal text
    expect(body.products).toHaveLength(0)
  })

  test("XSS in alias is stored as plain text", async ({ request }) => {
    const prodResp = await request.get("/api/produkte?sort=name")
    const products = (await prodResp.json()).products
    // Use the LAST product (by name) to avoid collision with serial alias tests using first
    const rawName = products[products.length - 1].raw_name

    const xssPayload = '<script>alert("xss")</script>'
    const resp = await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: xssPayload },
    })
    expect(resp.status()).toBe(200)

    // Verify it's stored as plain text via the PUT response
    const body = await resp.json()
    expect(body.alias).toBe(xssPayload)

    // Cleanup
    await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
  })
})

// ── Responsive ─────────────────────────────────────────────────────────────

test.describe("Responsive: Mobile product list", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("product page is usable on mobile", async ({ page, request }) => {
    await ensureBonsImported(request)
    await page.goto("/produkte")
    await expect(page.getByRole("heading", { name: "Produktdatenbank" })).toBeVisible()
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    // Search should still be visible
    await expect(page.getByPlaceholder("Produkt suchen")).toBeVisible()
  })
})
