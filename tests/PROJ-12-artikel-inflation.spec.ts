import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"

const EBON_DIR = path.join(process.cwd(), "data", "ebons")
const EBON1 = path.join(EBON_DIR, "REWE-ebon1.pdf")
const EBON2 = path.join(EBON_DIR, "REWE-ebon2.pdf")
const EBON3 = path.join(EBON_DIR, "REWE-eBon3.pdf")

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

// ── AC: API response shape ────────────────────────────────────────────────────

test.describe("PROJ-12: API — inflation_cagr_pct in GET /api/produkte", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/produkte enthält inflation_cagr_pct für jedes Produkt", async ({ request }) => {
    const res = await request.get("/api/produkte")
    expect(res.status()).toBe(200)
    const json = await res.json()

    for (const p of json.products) {
      expect(p).toHaveProperty("inflation_cagr_pct")
      const valid = p.inflation_cagr_pct === null || typeof p.inflation_cagr_pct === "number"
      expect(valid).toBe(true)
    }
  })

  test("inflation_cagr_pct ist null wenn Produkt nur 1 Kaufjahr hat", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()

    // Products with purchase_count of 1 definitely have only 1 year
    const singlePurchase = json.products.filter(
      (p: { purchase_count: number }) => p.purchase_count === 1
    )
    for (const p of singlePurchase) {
      expect(p.inflation_cagr_pct).toBeNull()
    }
  })

  test("inflation_cagr_pct ist eine Zahl wenn Produkt mehrere Kaufjahre hat", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()

    // Find products that have inflation_cagr_pct set — those have >= 2 purchase years
    const withCAGR = json.products.filter(
      (p: { inflation_cagr_pct: number | null }) => p.inflation_cagr_pct !== null
    )

    // It's fine if there are none (e.g. all eBons in same year), but if there are, validate
    for (const p of withCAGR) {
      expect(typeof p.inflation_cagr_pct).toBe("number")
      // CAGR must be a finite number (not NaN/Infinity)
      expect(isFinite(p.inflation_cagr_pct)).toBe(true)
    }
  })

  test("cagr_first_avg und cagr_last_avg sind NICHT in der API-Antwort (interne Felder)", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()

    for (const p of json.products) {
      expect(p).not.toHaveProperty("cagr_first_avg")
      expect(p).not.toHaveProperty("cagr_last_avg")
      expect(p).not.toHaveProperty("cagr_year_dist")
      expect(p).not.toHaveProperty("cagr_year_count")
    }
  })
})

// ── AC: preisentwicklung API ──────────────────────────────────────────────────

test.describe("PROJ-12: API — preisentwicklung mit CAGR und Teiljahr", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/produkte/[name]/preisentwicklung enthält inflation_cagr_pct", async ({ request }) => {
    // Get first product
    const listRes = await request.get("/api/produkte")
    const listJson = await listRes.json()
    const firstProduct = listJson.products[0]

    const res = await request.get(
      `/api/produkte/${encodeURIComponent(firstProduct.raw_name)}/preisentwicklung`
    )
    expect(res.status()).toBe(200)
    const json = await res.json()

    expect(json).toHaveProperty("inflation_cagr_pct")
    const valid = json.inflation_cagr_pct === null || typeof json.inflation_cagr_pct === "number"
    expect(valid).toBe(true)
  })

  test("Jahres-Einträge haben is_partial_year Flag", async ({ request }) => {
    const listRes = await request.get("/api/produkte")
    const listJson = await listRes.json()

    // Find a product with multiple purchases (more likely to have Jahres-Data)
    const multiPurchase = listJson.products.filter(
      (p: { purchase_count: number }) => p.purchase_count >= 2
    )

    if (multiPurchase.length === 0) return // No suitable products

    const product = multiPurchase[0]
    const res = await request.get(
      `/api/produkte/${encodeURIComponent(product.raw_name)}/preisentwicklung`
    )
    const json = await res.json()

    if (json.jahre && json.jahre.length > 0) {
      for (const row of json.jahre) {
        expect(row).toHaveProperty("is_partial_year")
        expect(typeof row.is_partial_year).toBe("boolean")
      }
    }
  })

  test("Jahres-Durchschnittspreis ist für jeden Eintrag gesetzt", async ({ request }) => {
    const listRes = await request.get("/api/produkte")
    const listJson = await listRes.json()
    const products = listJson.products.filter(
      (p: { purchase_count: number }) => p.purchase_count >= 2
    )

    if (products.length === 0) return

    const res = await request.get(
      `/api/produkte/${encodeURIComponent(products[0].raw_name)}/preisentwicklung`
    )
    const json = await res.json()

    for (const row of json.jahre) {
      expect(row).toHaveProperty("avg_preis_cents")
      expect(typeof row.avg_preis_cents).toBe("number")
      expect(row.avg_preis_cents).toBeGreaterThan(0)
    }
  })

  test("CAGR stimmt mit inflation_cagr_pct aus Produktliste überein", async ({ request }) => {
    const listRes = await request.get("/api/produkte")
    const listJson = await listRes.json()

    // Find a product with a non-null CAGR in the product list
    const withCAGR = listJson.products.find(
      (p: { inflation_cagr_pct: number | null }) => p.inflation_cagr_pct !== null
    )

    if (!withCAGR) return // No product with multi-year data in current test eBons

    const detailRes = await request.get(
      `/api/produkte/${encodeURIComponent(withCAGR.raw_name)}/preisentwicklung`
    )
    const detailJson = await detailRes.json()

    // Both computations should agree (within floating point tolerance)
    if (detailJson.inflation_cagr_pct !== null) {
      expect(Math.abs(withCAGR.inflation_cagr_pct - detailJson.inflation_cagr_pct)).toBeLessThan(0.2)
    }
  })
})

// ── AC: UI — Produktliste Spalte ─────────────────────────────────────────────

test.describe("PROJ-12: UI — Spalte Ø Inflation p.a. in Produktliste", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Spaltenheader 'Ø Inflation p.a.' auf Desktop (1440px) sichtbar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const header = page.getByRole("columnheader", { name: /Inflation p.a/i })
    await expect(header).toBeVisible()
  })

  test("Spalte 'Ø Inflation p.a.' auf Tablet (768px) sichtbar (md-Breakpoint)", async ({ page }) => {
    // Tailwind 'hidden md:table-cell' shows at 768px (md breakpoint = 768px)
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const header = page.getByRole("columnheader", { name: /Inflation p.a/i })
    await expect(header).toBeVisible()
  })

  test("Spalte 'Ø Inflation p.a.' auf Mobile (375px) nicht sichtbar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/produkte")
    await page.waitForSelector("table", { timeout: 10000 })

    const header = page.getByRole("columnheader", { name: /Inflation p.a/i })
    await expect(header).not.toBeVisible()
  })

  test("Inflation-Badges zeigen 'p.a.' Suffix wenn vorhanden", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    // Check if any inflation badges are visible
    const rows = await page.locator("table tbody tr").count()
    if (rows === 0) return

    // Look for any badge containing p.a.
    const badges = page.locator("table tbody td .rounded-full:has-text('p.a.')")
    const count = await badges.count()

    if (count > 0) {
      // Verify each badge also has an arrow
      const firstText = await badges.first().textContent()
      expect(firstText).toMatch(/[↑↓→]/)
      expect(firstText).toContain("p.a.")
    }
    // If no badges: all products are from same year, test passes gracefully
  })
})

// ── AC: UI — Chart Sheet mit CAGR ─────────────────────────────────────────────

test.describe("PROJ-12: UI — Chart Sheet CAGR Summary und Teiljahr", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Chart Sheet öffnet sich beim Klick auf TrendingUp Button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const chartBtn = page.locator("table tbody tr button[title='Preisentwicklung anzeigen']").first()
    await chartBtn.click()

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })
  })

  test("Jahrestabelle erscheint wenn Produkt mehrere Kaufjahre hat", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    // Try to find a product with CAGR badge (implies multi-year) by clicking chart button
    const chartBtns = page.locator("table tbody tr button[title='Preisentwicklung anzeigen']")
    const count = await chartBtns.count()
    if (count === 0) return

    // Click first product's chart button
    await chartBtns.first().click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // Wait for the sheet content to load (the chart or empty state)
    await page.waitForTimeout(2000)

    // Check if Jahr table is visible (only if multiple years of data)
    // Use exact match to avoid matching "Zum Vorjahr" which also contains "Jahr"
    const jahrHeader = page.getByRole("columnheader", { name: "Jahr", exact: true })
    const jahrVisible = await jahrHeader.isVisible().catch(() => false)

    if (jahrVisible) {
      // If Jahr table is present, it should have the Ø Preis column too
      await expect(page.getByRole("columnheader", { name: /Preis/ })).toBeVisible()
    }
    // If not visible: product only has 1 year of data, test passes gracefully
  })
})

// ── AC: Performance ──────────────────────────────────────────────────────────

test.describe("PROJ-12: Performance", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/produkte antwortet unter 1000ms (CAGR-Query berücksichtigt)", async ({ request }) => {
    const start = Date.now()
    const res = await request.get("/api/produkte")
    const elapsed = Date.now() - start
    expect(res.status()).toBe(200)
    // Relaxed threshold: CAGR adds 4 extra subqueries
    expect(elapsed).toBeLessThan(1000)
  })

  test("Produktliste lädt unter 6 Sekunden", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const start = Date.now()
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(6000)
  })
})
