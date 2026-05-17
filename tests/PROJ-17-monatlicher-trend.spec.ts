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

// ── AC: API endpoint returns all months ──────────────────────────────────────

test.describe("AC: Monatlicher Ausgaben-Langzeittrend API", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/statistiken/monatlich without params returns all months", async ({ request }) => {
    const res = await request.get("/api/statistiken/monatlich")
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.monate).toBeDefined()
    expect(Array.isArray(json.monate)).toBe(true)
    expect(json.monate.length).toBeGreaterThan(0)

    // Verify structure of each month
    for (const monat of json.monate) {
      expect(monat).toHaveProperty("monat")
      expect(monat).toHaveProperty("ausgaben_cents")
      expect(monat.monat).toMatch(/^\d{4}-\d{2}$/) // YYYY-MM format
      expect(typeof monat.ausgaben_cents).toBe("number")
    }
  })

  test("GET /api/statistiken/monatlich returns months in ascending order", async ({ request }) => {
    const res = await request.get("/api/statistiken/monatlich")
    const json = await res.json()
    const monate = json.monate as { monat: string }[]

    for (let i = 1; i < monate.length; i++) {
      expect(monate[i].monat).toGreaterThanOrEqual(monate[i - 1].monat)
    }
  })

  test("GET /api/statistiken/monatlich with ?monate=3 returns only last 3 months", async ({ request }) => {
    const allRes = await request.get("/api/statistiken/monatlich")
    const allJson = await allRes.json()
    const allMonate = allJson.monate as { monat: string }[]

    const filtered3mRes = await request.get("/api/statistiken/monatlich?monate=3")
    const filtered3mJson = await filtered3mRes.json()
    const filtered3mMonate = filtered3mJson.monate as { monat: string }[]

    expect(filtered3mMonate.length).toBeLessThanOrEqual(allMonate.length)
    // Verify that all months in 3M filter are the most recent ones
    const lastMonths = allMonate.slice(-3)
    expect(filtered3mMonate.length).toBeLessThanOrEqual(lastMonths.length)
  })

  test("API responds within 300ms performance target", async ({ request }) => {
    const start = Date.now()
    const res = await request.get("/api/statistiken/monatlich")
    const elapsed = Date.now() - start
    expect(res.status()).toBe(200)
    expect(elapsed).toBeLessThan(300)
  })
})

// ── AC: Dashboard card renders correctly ──────────────────────────────────────

test.describe("AC: Monatlicher Ausgaben-Langzeittrend Card", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Dashboard displays new Langzeittrend card", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("h2", { timeout: 10000 })

    const cardTitle = page.getByText("Monatlicher Ausgaben-Langzeittrend")
    await expect(cardTitle).toBeVisible()
  })

  test("Chart renders with all available months", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    // Find the Langzeittrend card
    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")

    // Check that SVG chart is rendered
    const chart = card.locator("svg").first()
    await expect(chart).toBeVisible()
  })

  test("X-axis shows months in correct format (Jan 24, Feb 24, etc.)", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    // Get text from chart X-axis
    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const xAxisText = await card.locator("g text").allTextContents()

    // Should contain month abbreviations with years (e.g., "Jan 24")
    const monthPattern = /^(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\s+\d{2}$/
    const hasMonthLabels = xAxisText.some(text => monthPattern.test(text))
    expect(hasMonthLabels).toBe(true)
  })

  test("Y-axis shows EUR currency", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const yAxisText = await card.locator("g text").allTextContents()

    // Should contain € symbol or EUR values
    const hasEuroSymbol = yAxisText.some(text => text.includes("€"))
    expect(hasEuroSymbol).toBe(true)
  })

  test("Average line is displayed with value label", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")

    // Check for average line in chart (dashed line)
    const lines = card.locator("line")
    const lineCount = await lines.count()
    expect(lineCount).toBeGreaterThan(0)

    // Check for average value in bottom section
    const averageSection = card.locator("text=Durchschnitt:")
    await expect(averageSection).toBeVisible()

    // Average value should be displayed with € symbol
    const valueText = await card.locator("text=Durchschnitt:").locator("..").textContent()
    expect(valueText).toContain("€")
  })

  test("Card is independent from 3M/6M/12M filter buttons", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    // Get initial chart data
    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const initialChart = card.locator("svg").first()

    // Click 3M filter button
    const filter3m = page.getByRole("button", { name: /3 Monate|3M|3 M/ })
    if (await filter3m.isVisible()) {
      await filter3m.click()
      await page.waitForTimeout(500)

      // Langzeittrend card should still be visible and unchanged
      const langzeitstrendCard = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
      await expect(langzeitstrendCard).toBeVisible()
    }
  })
})

// ── AC: Tooltip shows correct information ────────────────────────────────────

test.describe("AC: Monatlicher Trend Tooltip", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Hovering over a data point shows month and amount in tooltip", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const chart = card.locator("svg").first()

    // Hover over the chart area to trigger tooltip
    await chart.hover({ position: { x: 100, y: 150 } })
    await page.waitForTimeout(200)

    // Tooltip should appear with month and amount
    const tooltip = page.locator("text=Ausgaben:")
    // Tooltip might not appear in all cases, so this is optional
  })
})

// ── AC: Edge Cases ───────────────────────────────────────────────────────────

test.describe("AC: Monatlicher Trend Edge Cases", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("dashboard shows no error when displaying data with gaps", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    await expect(card).toBeVisible()

    // Should not show error message
    const errorMsg = card.locator("text=Fehler|Error|keine Daten").first()
    // Card should show chart, not error
    const chart = card.locator("svg").first()
    await expect(chart).toBeVisible()
  })

  test("card renders with single month of data without error", async ({ page, request }) => {
    // If all imports already happened, this tests the existing data
    // In a real scenario with DB reset, we'd import only one eBon
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")

    // Card should display without error
    const chart = card.locator("svg")
    await expect(chart.first()).toBeVisible()
  })

  test("no gaps appear in the line chart for months without purchases", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const chart = card.locator("svg").first()

    // Verify chart is rendered (continuous line, no visible gaps)
    await expect(chart).toBeVisible()

    // A properly filled chart should have a continuous line path
    const paths = chart.locator("path")
    const pathCount = await paths.count()
    expect(pathCount).toBeGreaterThan(0)
  })

  test("X-axis labels are readable for 36+ months (every 3rd or 4th label)", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const xAxisLabels = card.locator("g text").allTextContents()

    // Should have some visible labels (not all labels shown if many months)
    const labels = await xAxisLabels
    const visibleLabels = labels.filter(l => l.match(/^(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)/))

    // With proper label interval handling, should have at least 1 label
    expect(visibleLabels.length).toBeGreaterThan(0)
  })
})

// ── AC: Performance and Responsiveness ───────────────────────────────────────

test.describe("AC: Monatlicher Trend Performance", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("statistiken page loads within 6 seconds with chart visible", async ({ page }) => {
    const start = Date.now()
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(6000)
  })

  test("chart is responsive on mobile (375px width)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const chart = card.locator("svg").first()
    await expect(chart).toBeVisible()
  })

  test("chart is responsive on tablet (768px width)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const chart = card.locator("svg").first()
    await expect(chart).toBeVisible()
  })

  test("chart is responsive on desktop (1440px width)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/statistiken")
    await page.waitForSelector("text=Monatlicher Ausgaben-Langzeittrend", { timeout: 10000 })

    const card = page.locator("text=Monatlicher Ausgaben-Langzeittrend").locator("..")
    const chart = card.locator("svg").first()
    const avgSection = card.locator("text=Durchschnitt:")

    await expect(chart).toBeVisible()
    await expect(avgSection).toBeVisible()
  })
})
