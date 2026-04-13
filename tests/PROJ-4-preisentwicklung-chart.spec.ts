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

/** Opens the price chart sheet for the first product in the list */
async function openChartForFirstProduct(page: import("@playwright/test").Page) {
  await page.goto("/produkte")
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
  const chartBtn = page.locator("table tbody tr").first().getByTitle("Preisentwicklung anzeigen")
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/preise") && res.status() === 200
  )
  await chartBtn.click()
  await responsePromise
}

// ── AC: Chart-Icon in Produktliste öffnet Sheet ─────────────────────────────

test.describe("AC: Preis-Chart öffnen", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("each product row has a chart icon button", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    const chartBtn = page.locator("table tbody tr").first().getByTitle("Preisentwicklung anzeigen")
    await expect(chartBtn).toBeVisible()
  })

  test("clicking chart icon opens the price sheet", async ({ page }) => {
    await openChartForFirstProduct(page)
    // Sheet should open — look for the product switcher combobox inside the dialog
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByRole("combobox")).toBeVisible()
  })
})

// ── AC: Produktauswahl via Suchfeld mit Autocomplete ────────────────────────

test.describe("AC: Produktsuche im Chart-Sheet", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("product switcher combobox is present and shows current product", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    const firstRawName = await page.locator("table tbody tr").first().locator("td").nth(0).innerText()

    await openChartForFirstProduct(page)
    const dialog = page.getByRole("dialog")
    const combobox = dialog.getByRole("combobox")
    await expect(combobox).toBeVisible()
    await expect(combobox).toContainText(firstRawName.trim())
  })

  test("product switcher opens dropdown with searchable product list", async ({ page }) => {
    await openChartForFirstProduct(page)
    const dialog = page.getByRole("dialog")
    // Click the combobox to open the dropdown
    await dialog.getByRole("combobox").click()
    // Should show search input inside the popover (use cmdk-input)
    await expect(page.locator("[cmdk-input]")).toBeVisible({ timeout: 5000 })
    // Should show at least one product option
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 5000 })
  })

  test("switching product in combobox loads new price data", async ({ page }) => {
    await openChartForFirstProduct(page)
    const dialog = page.getByRole("dialog")

    // Open combobox and select a different product
    await dialog.getByRole("combobox").click()
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 5000 })
    const options = page.getByRole("option")
    const optionCount = await options.count()
    if (optionCount > 1) {
      const priceResponse = page.waitForResponse(
        (res) => res.url().includes("/preise") && res.status() === 200
      )
      await options.nth(1).click()
      await priceResponse
    }
  })
})

// ── AC: Chart zeigt Kaufpreis über Zeit ──────────────────────────────────────

test.describe("AC: Linien-Chart Darstellung", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("chart area or single-purchase hint is visible after opening sheet", async ({ page }) => {
    await openChartForFirstProduct(page)

    // Should show either chart (recharts container), single-purchase hint, or empty state
    const chart = page.locator(".recharts-responsive-container")
    const singleHint = page.getByText("Nur ein Kauf vorhanden")
    const emptyState = page.getByText("Keine Preisdaten vorhanden")

    // Wait a moment for render
    await page.waitForTimeout(500)

    const hasChart = await chart.isVisible().catch(() => false)
    const hasSingleHint = await singleHint.isVisible().catch(() => false)
    const hasEmpty = await emptyState.isVisible().catch(() => false)

    expect(hasChart || hasSingleHint || hasEmpty).toBe(true)
  })

  test("chart shows summary stats (lowest, average, highest) when multiple data points exist", async ({ page }) => {
    await openChartForFirstProduct(page)

    const chart = page.locator(".recharts-responsive-container")
    const hasChart = await chart.isVisible().catch(() => false)
    if (hasChart) {
      await expect(page.getByText("Niedrigster")).toBeVisible()
      await expect(page.getByText("Durchschnitt")).toBeVisible()
      await expect(page.getByText("Höchster")).toBeVisible()
    }
  })

  test("chart legend shows normal and discount markers", async ({ page }) => {
    await openChartForFirstProduct(page)

    const chart = page.locator(".recharts-responsive-container")
    const hasChart = await chart.isVisible().catch(() => false)
    if (hasChart) {
      await expect(page.getByText("Normaler Kauf")).toBeVisible()
      await expect(page.getByText("Mit Rabatt")).toBeVisible()
    }
  })
})

// ── AC: Chart-Titel zeigt Alias oder Rohname ─────────────────────────────────

test.describe("AC: Chart-Titel", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("sheet title shows product name (raw or alias)", async ({ page }) => {
    await openChartForFirstProduct(page)

    const dialog = page.getByRole("dialog")
    // SheetTitle renders as a heading inside the dialog
    const title = dialog.locator("h2, [class*='font-semibold']").first()
    await expect(title).toBeVisible({ timeout: 5000 })
    const titleText = await title.innerText()
    expect(titleText.length).toBeGreaterThan(0)
    expect(titleText).not.toBe("Lade...")
  })
})

// ── AC: Mindestens 2 Datenpunkte nötig, sonst Hinweistext ────────────────────

test.describe("AC: Einzelkauf-Hinweis", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("single-purchase product shows hint instead of chart", async ({ page, request }) => {
    // Find a product with exactly 1 purchase via API
    const productsRes = await request.get("/api/produkte?sort=frequency")
    const productsData = await productsRes.json()
    const singlePurchaseProduct = productsData.products.find(
      (p: { purchase_count: number }) => p.purchase_count === 1
    )

    if (!singlePurchaseProduct) {
      test.skip(true, "No single-purchase product in test data")
      return
    }

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Search for the single-purchase product
    await page.getByPlaceholder("Produkt suchen").fill(singlePurchaseProduct.raw_name)
    await page.waitForResponse((res) => res.url().includes("/api/produkte?") && res.status() === 200)

    // Click chart icon for this product
    const chartBtn = page.locator("table tbody tr").first().getByTitle("Preisentwicklung anzeigen")
    await expect(chartBtn).toBeVisible({ timeout: 5000 })
    const priceResponse = page.waitForResponse(
      (res) => res.url().includes("/preise") && res.status() === 200
    )
    await chartBtn.click()
    await priceResponse

    // Should show single-purchase hint
    await expect(page.getByText("Nur ein Kauf vorhanden")).toBeVisible({ timeout: 5000 })
    // Should NOT show a chart
    await expect(page.locator(".recharts-responsive-container")).not.toBeVisible()
  })
})

// ── AC: Sheet schließen und erneut öffnen ────────────────────────────────────

test.describe("AC: Sheet Interaktion", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("sheet can be closed and re-opened for a different product", async ({ page }) => {
    await openChartForFirstProduct(page)
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("combobox")).toBeVisible()

    // Close sheet by pressing Escape
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 })

    // Open chart for second product (if exists)
    const rows = page.locator("table tbody tr")
    const rowCount = await rows.count()
    if (rowCount > 1) {
      const secondBtn = rows.nth(1).getByTitle("Preisentwicklung anzeigen")
      const priceResponse = page.waitForResponse(
        (res) => res.url().includes("/preise") && res.status() === 200
      )
      await secondBtn.click()
      await priceResponse
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
    }
  })
})

// ── AC: API /api/produkte/[name]/preise ──────────────────────────────────────

test.describe("AC: API /api/produkte/[name]/preise", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("returns price history with correct structure", async ({ request }) => {
    const productsRes = await request.get("/api/produkte?sort=frequency")
    const productsData = await productsRes.json()
    expect(productsData.products.length).toBeGreaterThan(0)
    const rawName = productsData.products[0].raw_name

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preise`)
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data).toHaveProperty("raw_name", rawName)
    expect(data).toHaveProperty("alias")
    expect(data).toHaveProperty("preise")
    expect(Array.isArray(data.preise)).toBe(true)

    if (data.preise.length > 0) {
      const point = data.preise[0]
      expect(point).toHaveProperty("datum")
      expect(point).toHaveProperty("einzelpreis_cents")
      expect(point).toHaveProperty("rabatt_cents")
      expect(point).toHaveProperty("bon_nr")
      expect(point).toHaveProperty("markt")
      expect(point.einzelpreis_cents).toBeGreaterThan(0)
    }
  })

  test("returns empty array for nonexistent product", async ({ request }) => {
    const res = await request.get("/api/produkte/DOES_NOT_EXIST_12345/preise")
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.preise).toEqual([])
    expect(data.alias).toBeNull()
  })

  test("preise are sorted by date ascending", async ({ request }) => {
    const productsRes = await request.get("/api/produkte?sort=frequency")
    const productsData = await productsRes.json()
    const rawName = productsData.products[0].raw_name

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preise`)
    const data = await res.json()

    if (data.preise.length >= 2) {
      for (let i = 1; i < data.preise.length; i++) {
        expect(data.preise[i].datum >= data.preise[i - 1].datum).toBe(true)
      }
    }
  })

  test("all returned prices are positive (zero/negative excluded)", async ({ request }) => {
    const productsRes = await request.get("/api/produkte?sort=frequency")
    const productsData = await productsRes.json()

    // Test first 5 products to avoid timeout
    const toTest = productsData.products.slice(0, 5)
    for (const product of toTest) {
      const res = await request.get(`/api/produkte/${encodeURIComponent(product.raw_name)}/preise`)
      const data = await res.json()
      for (const point of data.preise) {
        expect(point.einzelpreis_cents).toBeGreaterThan(0)
      }
    }
  })

  test("returns alias when product has one", async ({ request }) => {
    const productsRes = await request.get("/api/produkte?sort=frequency")
    const productsData = await productsRes.json()
    const rawName = productsData.products[0].raw_name

    // Set an alias
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "QA Test Alias" },
    })

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preise`)
    const data = await res.json()
    expect(data.alias).toBe("QA Test Alias")

    // Clean up
    await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
  })
})

// ── Security: Input validation ──────────────────────────────────────────────

test.describe("Security: Preise API", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("SQL injection via product name is harmless", async ({ request }) => {
    const malicious = "'; DROP TABLE receipts; --"
    const res = await request.get(`/api/produkte/${encodeURIComponent(malicious)}/preise`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.preise).toEqual([])

    // Verify receipts table still exists
    const bonsRes = await request.get("/api/bons")
    expect(bonsRes.status()).toBe(200)
  })

  test("special characters in product name are handled safely", async ({ request }) => {
    const special = encodeURIComponent("PRODUKT MIT SONDERZEICHEN äöü")
    const res = await request.get(`/api/produkte/${special}/preise`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.preise).toEqual([])
  })
})

// ── Responsive: Mobile ──────────────────────────────────────────────────────

test.describe("Responsive: Mobile chart", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("chart icon is visible and functional on mobile", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const chartBtn = page.locator("table tbody tr").first().getByTitle("Preisentwicklung anzeigen")
    await expect(chartBtn).toBeVisible()

    const priceResponse = page.waitForResponse(
      (res) => res.url().includes("/preise") && res.status() === 200
    )
    await chartBtn.click()
    await priceResponse
    // Sheet should open on mobile
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
  })
})
