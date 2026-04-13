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

// ── AC: Trend-Indikator-Badge in Produktliste ────────────────────────────────

test.describe("AC: Preistrend-Indikator API", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/produkte returns price_trend_pct field", async ({ request }) => {
    const res = await request.get("/api/produkte")
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.products).toBeDefined()
    expect(Array.isArray(json.products)).toBe(true)
    // Every product has price_trend_pct (number or null)
    for (const p of json.products) {
      expect(p).toHaveProperty("price_trend_pct")
      expect(p.price_trend_pct === null || typeof p.price_trend_pct === "number").toBe(true)
    }
  })

  test("GET /api/produkte returns first_price_cents field", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()
    for (const p of json.products) {
      expect(p).toHaveProperty("first_price_cents")
      expect(p.first_price_cents === null || typeof p.first_price_pcts === "number" || typeof p.first_price_cents === "number").toBe(true)
    }
  })

  test("price_data_count is NOT exposed in API response", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()
    for (const p of json.products) {
      expect(p).not.toHaveProperty("price_data_count")
    }
  })

  test("products appearing only once have price_trend_pct = null", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()
    const singlePurchase = json.products.filter((p: { purchase_count: number }) => p.purchase_count === 1)
    for (const p of singlePurchase) {
      expect(p.price_trend_pct).toBeNull()
    }
  })
})

test.describe("AC: Preistrend Spalte in Produktliste UI", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Preistrend column header is visible on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })
    await expect(page.getByRole("columnheader", { name: "Preistrend" })).toBeVisible()
  })

  test("products with ≥2 purchases show a trend badge", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    // At least one badge should be visible for products bought across multiple eBons
    const badges = page.locator("table tbody tr").locator(".rounded-full")
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
  })

  test("trend badges contain arrow character and percent sign", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const badges = page.locator("table tbody tr .rounded-full")
    const badgeCount = await badges.count()

    if (badgeCount > 0) {
      const firstBadgeText = await badges.first().textContent()
      // Should contain an arrow (↑, ↓, or →) and %
      expect(firstBadgeText).toMatch(/[↑↓→]/)
      expect(firstBadgeText).toContain("%")
    }
  })

  test("no badge shown for products with only 1 purchase (no placeholder)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    // Find rows where purchase count column shows "1×"
    const rows = page.locator("table tbody tr")
    const rowCount = await rows.count()

    for (let i = 0; i < Math.min(rowCount, 30); i++) {
      const row = rows.nth(i)
      const purchaseCell = row.locator("td").nth(2) // Käufe column
      const cellText = await purchaseCell.textContent()
      if (cellText?.trim() === "1×") {
        // The Preistrend cell (index 4) should be empty — no badge, no "-"
        const trendCell = row.locator("td").nth(4)
        const trendText = await trendCell.textContent()
        expect(trendText?.trim()).toBe("")
        break
      }
    }
  })

  test("clicking trend badge opens price chart sheet", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const badges = page.locator("table tbody tr .rounded-full")
    const badgeCount = await badges.count()

    if (badgeCount > 0) {
      await badges.first().click()
      // Price chart sheet should open
      await expect(page.getByRole("dialog", { name: "Preisentwicklung" })).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe("AC: Performance", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("product list page loads within acceptable time", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const start = Date.now()
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })
    const elapsed = Date.now() - start
    // Should load within 6 seconds (Playwright overhead; well above the 200ms delta requirement)
    expect(elapsed).toBeLessThan(6000)
  })

  test("API /api/produkte responds within 500ms", async ({ request }) => {
    const start = Date.now()
    const res = await request.get("/api/produkte")
    const elapsed = Date.now() - start
    expect(res.status()).toBe(200)
    expect(elapsed).toBeLessThan(500)
  })
})

test.describe("AC: Responsive", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Preistrend column is hidden on mobile (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/produkte")
    await page.waitForSelector("table", { timeout: 10000 })
    // Column header should not be visible on mobile
    const header = page.getByRole("columnheader", { name: "Preistrend" })
    await expect(header).not.toBeVisible()
  })

  test("Preistrend column is visible on tablet (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })
    await expect(page.getByRole("columnheader", { name: "Preistrend" })).toBeVisible()
  })
})
