import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"

const EBON_DIR = path.join(process.cwd(), "data", "ebons")
const EBON1 = path.join(EBON_DIR, "REWE-ebon1.pdf")
const EBON2 = path.join(EBON_DIR, "REWE-ebon2.pdf")
const EBON3 = path.join(EBON_DIR, "REWE-eBon3.pdf")

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Import a PDF via the API directly (faster than UI upload for setup). */
async function importPdf(request: import("@playwright/test").APIRequestContext, pdfPath: string) {
  const pdfBuffer = fs.readFileSync(pdfPath)
  const filename = path.basename(pdfPath)
  await request.post("/api/import", {
    multipart: {
      file: { name: filename, mimeType: "application/pdf", buffer: pdfBuffer },
    },
  })
}

/** Ensure all 3 test eBons are imported (idempotent — duplicates return 409). */
async function ensureBonsImported(request: import("@playwright/test").APIRequestContext) {
  await importPdf(request, EBON1)
  await importPdf(request, EBON2)
  await importPdf(request, EBON3)
}

// ── Bon-Übersicht (list page) ───────────────────────────────────────────────

test.describe("AC: Bon-Übersicht", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("shows all bons as a table with correct columns", async ({ page }) => {
    await page.goto("/")
    // Table should have at least 3 rows (one per imported eBon)
    const rows = page.locator("table tbody tr")
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(3)
    // Verify column content exists
    await expect(page.getByText(/29\.12\.2025|23\.12\.2025|30\.09\.2025/).first()).toBeVisible()
  })

  test("list is sorted by date descending (newest first)", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    // First row should be 29.12.2025 (ebon1, newest date)
    const firstRowDate = page.locator("table tbody tr").first().locator("td").first()
    await expect(firstRowDate).toContainText("29.12.2025")
  })

  test("summary header shows total count and total spent", async ({ page }) => {
    await page.goto("/")
    // Should show "3" or more bons and a EUR amount
    await expect(page.getByText(/\d+/).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("EUR")).toBeVisible()
    await expect(page.getByText(/Bon/).first()).toBeVisible()
  })

  test("date filter narrows results", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Filter to only September 2025 (should show only ebon3)
    await page.fill("#date-from", "2025-09-01")
    await page.fill("#date-to", "2025-09-30")

    // Wait for the filtered results to load
    await page.waitForResponse((res) => res.url().includes("/api/bons") && res.status() === 200)
    await expect(page.getByText("30.09.2025")).toBeVisible({ timeout: 5000 })
    // ebon1 (29.12) and ebon2 (23.12) should not be visible
    await expect(page.getByText("29.12.2025")).not.toBeVisible()
    await expect(page.getByText("23.12.2025")).not.toBeVisible()
  })

  test("filter reset shows all bons again", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Apply a filter
    await page.fill("#date-from", "2025-09-01")
    await page.fill("#date-to", "2025-09-30")
    await page.waitForResponse((res) => res.url().includes("/api/bons") && res.status() === 200)

    // Reset filter
    const resetButton = page.getByText("Filter zurücksetzen")
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/bons") && res.status() === 200),
      resetButton.click(),
    ])

    // All bons should be back
    await expect(page.locator("table tbody tr").nth(2)).toBeVisible({ timeout: 10000 })
    const rows = page.locator("table tbody tr")
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test("clicking a bon navigates to detail page", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Click the first row
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(/\/bon\/\d+/)
  })
})

// ── Empty state ─────────────────────────────────────────────────────────────

test.describe("AC: Empty state (filter yields no results)", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("shows empty message when date filter yields no results", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Filter to a future date range with no bons
    await page.fill("#date-from", "2099-01-01")
    await page.fill("#date-to", "2099-12-31")
    await page.waitForResponse((res) => res.url().includes("/api/bons") && res.status() === 200)
    await expect(page.getByText("Keine Bons im gewählten Zeitraum")).toBeVisible()
  })
})

// ── Bon-Detailansicht ───────────────────────────────────────────────────────

test.describe("AC: Bon-Detailansicht", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("detail page shows bon header with date, store, payment", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(/\/bon\/\d+/)

    // Header card should show store name and date
    await expect(page.getByText(/Rewe/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/\d{2}\.\d{2}\.\d{4}/).first()).toBeVisible()
    await expect(page.getByText(/Bon-Nr\./).first()).toBeVisible()
  })

  test("detail page shows product items with prices", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(/\/bon\/\d+/)

    // Should have at least one product row with a price in Euro format
    await expect(page.getByText(/\d+,\d{2}\s*€/).first()).toBeVisible({ timeout: 5000 })
  })

  test("detail page shows MwSt breakdown", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(/\/bon\/\d+/, { timeout: 10000 })

    // Wait for detail content to load
    await expect(page.getByText(/Rewe/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("MwSt-Aufschlüsselung")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Summe/).first()).toBeVisible()
  })

  test("detail page has back link to overview", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(/\/bon\/\d+/)

    await page.getByText("Zurück zur Übersicht").click()
    await expect(page).toHaveURL("/")
  })

  test("detail page shows delete button with confirmation dialog", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(/\/bon\/\d+/)

    // Click delete button
    await page.getByText("Bon löschen").click()
    // Confirmation dialog appears
    await expect(page.getByText("Bon löschen?")).toBeVisible()
    await expect(page.getByText("unwiderruflich")).toBeVisible()
    // Cancel
    await page.getByText("Abbrechen").click()
    // Still on detail page
    await expect(page).toHaveURL(/\/bon\/\d+/)
  })
})

// ── Delete flow ─────────────────────────────────────────────────────────────

test.describe("AC: Bon löschen", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("deleting a bon redirects to overview and removes it from list", async ({ page, request }) => {
    // Use API to get a known bon ID for direct navigation (avoids click race)
    const listResp = await request.get("/api/bons")
    const list = await listResp.json()
    const bonId = list.bons[0].id

    await page.goto(`/bon/${bonId}`)
    await expect(page.getByText(/Rewe/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Bon löschen")).toBeVisible({ timeout: 5000 })

    // Delete it
    await page.getByText("Bon löschen").click()
    await expect(page.getByText("Endgültig löschen")).toBeVisible()
    await page.getByText("Endgültig löschen").click()

    // Should redirect to overview
    await expect(page).toHaveURL("/", { timeout: 10000 })

    // Verify via API that the deleted bon no longer exists
    const detailResp = await request.get(`/api/bons/${bonId}`)
    expect(detailResp.status()).toBe(404)
  })
})

// ── API direct tests ────────────────────────────────────────────────────────

test.describe("AC: API /api/bons", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/bons returns list with summary stats", async ({ request }) => {
    const resp = await request.get("/api/bons")
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.bons).toBeDefined()
    expect(body.total_count).toBeGreaterThanOrEqual(1)
    expect(body.total_spent_cents).toBeDefined()
  })

  test("GET /api/bons with date filter works", async ({ request }) => {
    const resp = await request.get("/api/bons?from=2025-09-01&to=2025-09-30")
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    // Only ebon3 (30.09.2025) should match
    for (const bon of body.bons) {
      expect(bon.receipt_date).toMatch(/^2025-09/)
    }
  })

  test("GET /api/bons/[id] returns full detail", async ({ request }) => {
    // Get list first to find an ID
    const listResp = await request.get("/api/bons")
    const list = await listResp.json()
    const bonId = list.bons[0].id

    const resp = await request.get(`/api/bons/${bonId}`)
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.id).toBe(bonId)
    expect(body.items).toBeDefined()
    expect(body.items.length).toBeGreaterThan(0)
    // Items should have discounts array
    expect(body.items[0].discounts).toBeDefined()
  })

  test("GET /api/bons/999999 returns 404", async ({ request }) => {
    const resp = await request.get("/api/bons/999999")
    expect(resp.status()).toBe(404)
  })

  test("DELETE /api/bons/999999 returns 404", async ({ request }) => {
    const resp = await request.delete("/api/bons/999999")
    expect(resp.status()).toBe(404)
  })

  test("GET /api/bons/abc returns 400", async ({ request }) => {
    const resp = await request.get("/api/bons/abc")
    expect(resp.status()).toBe(400)
  })
})

// ── Responsive ──────────────────────────────────────────────────────────────

test.describe("Responsive: Mobile bon list", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("bon list is usable on mobile", async ({ page, request }) => {
    await ensureBonsImported(request)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Bon-Übersicht" })).toBeVisible()
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
  })
})
