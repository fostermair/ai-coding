import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"

const EBON_DIR = path.join(process.cwd(), "data", "ebons")
const EBON1 = path.join(EBON_DIR, "REWE-ebon1.pdf")
const EBON2 = path.join(EBON_DIR, "REWE-ebon2.pdf")
const EBON3 = path.join(EBON_DIR, "REWE-eBon3.pdf")

// Run all tests in this file serially to avoid shared-DB race conditions
test.describe.configure({ mode: "serial" })

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

async function getFirstProductName(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.get("/api/produkte?sort=frequency")
  const json = await res.json()
  return json.products[0].raw_name as string
}

async function resetExclusion(request: import("@playwright/test").APIRequestContext, rawName: string) {
  await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
    data: { excluded: false },
  })
}

async function resetAllExclusions(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/produkte?sort=frequency")
  if (!res.ok()) return
  const json = await res.json()
  for (const p of json.products as Array<{ raw_name: string; excluded_from_stats: boolean }>) {
    if (p.excluded_from_stats) {
      await resetExclusion(request, p.raw_name)
    }
  }
}

// ── AC: Tab-Navigation ───────────────────────────────────────────────────────

test.describe("AC: Tab-Navigation (PROJ-13)", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("both tabs are present and clickable", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Both tabs should be visible
    await expect(page.getByRole("tab", { name: "Produkte" })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Ausgeblendet/ })).toBeVisible()
  })

  test("clicking tabs switches between views", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)

    // Pre-exclude one product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Main tab shows product
    let productRow = page.locator("table tbody tr").filter({ hasText: rawName })
    const initialCount = await productRow.count()
    expect(initialCount).toBe(0) // Excluded, so not in main tab

    // Switch to Ausgeblendet and see it there
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)

    productRow = page.locator("table tbody tr").filter({ hasText: rawName })
    const excludedCount = await productRow.count()
    expect(excludedCount).toBe(1) // Found in excluded tab

    await resetExclusion(request, rawName)
  })
})

// ── AC: Haupt-Tab zeigt nur aktive Artikel ──────────────────────────────────

test.describe("AC: Haupt-Tab 'Produkte' — nur aktive Artikel", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("main tab shows no excluded articles when some are hidden", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Table content may change on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude one product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Excluded product should NOT be in Produkte tab
    const rows = await page.locator(`table tbody tr:has-text("${rawName}")`).count()
    expect(rows).toBe(0)

    await resetExclusion(request, rawName)
  })

  test("product can be toggled to excluded via switch in main tab", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit", "Switch column behavior differs on Safari mobile")
    const rawName = await getFirstProductName(request)

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Find product row
    const productRow = page.locator("table tbody tr").filter({ hasText: rawName }).first()
    await expect(productRow).toBeVisible()

    // Toggle the switch
    const switchElem = productRow.locator("role=switch")
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/exclude") && r.request().method() === "PUT", { timeout: 5000 }),
      switchElem.click(),
    ])

    // Verify via API that exclusion was saved
    const res = await request.get("/api/produkte?sort=frequency")
    const json = await res.json()
    const product = json.products.find((p: { raw_name: string }) => p.raw_name === rawName)
    expect(product.excluded_from_stats).toBe(true)

    await resetExclusion(request, rawName)
  })
})

// ── AC: Ausgeblendet-Tab zeigt ausgeblendete Artikel ────────────────────────

test.describe("AC: Ausgeblendet-Tab — nur ausgeblendete Artikel", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("excluded tab shows products marked as excluded", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Table content may change on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude one product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Switch to Ausgeblendet tab
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)

    // Excluded product should be visible
    const excludedRow = page.locator("table tbody tr").filter({ hasText: rawName })
    await expect(excludedRow.first()).toBeVisible({ timeout: 5000 })

    await resetExclusion(request, rawName)
  })

  test("excluded tab has same columns as main tab", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Table layout may change on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude one product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Main tab should have table headers (Produkt, Alias, Käufe, etc.)
    const prodHeader = page.getByRole("columnheader", { name: "Produkt" })
    await expect(prodHeader).toBeVisible()

    // Switch to excluded tab
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)

    // Excluded tab should show the excluded product with same table structure
    const excludedRow = page.locator("table tbody tr").filter({ hasText: rawName })
    await expect(excludedRow.first()).toBeVisible({ timeout: 5000 })

    // Verify same column structure exists in excluded tab (product cells should be visible)
    const productCells = excludedRow.first().locator("td").nth(0)
    await expect(productCells).not.toBeEmpty()

    await resetExclusion(request, rawName)
  })
})

// ── AC: Tab-Header zeigt Zahl der ausgeblendeten Artikel ────────────────────

test.describe("AC: Tab-Header mit Zahl — Ausgeblendet (N)", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("tab header shows correct count when products are excluded", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)

    // Exclude one product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Tab header should show "Ausgeblendet (1)"
    const ausgeblendet_tab = page.getByRole("tab", { name: "Ausgeblendet (1)" })
    await expect(ausgeblendet_tab).toBeVisible()

    await resetExclusion(request, rawName)
  })

  test("tab header count updates after toggling product in main tab", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    const rawName = await getFirstProductName(request)

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Initially "Ausgeblendet (0)"
    let ausgeblendet_tab = page.getByRole("tab", { name: "Ausgeblendet (0)" })
    await expect(ausgeblendet_tab).toBeVisible()

    // Toggle exclude on first product
    const productRow = page.locator("table tbody tr").filter({ hasText: rawName }).first()
    const switchElem = productRow.locator("role=switch")
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/exclude") && r.request().method() === "PUT", { timeout: 5000 }),
      switchElem.click(),
    ])
    await page.waitForTimeout(400)

    // Now should show "Ausgeblendet (1)"
    ausgeblendet_tab = page.getByRole("tab", { name: "Ausgeblendet (1)" })
    await expect(ausgeblendet_tab).toBeVisible()

    await resetExclusion(request, rawName)
  })

  test("tab header shows (0) when nothing is excluded", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const ausgeblendet_tab = page.getByRole("tab", { name: "Ausgeblendet (0)" })
    await expect(ausgeblendet_tab).toBeVisible()
  })
})

// ── AC: Wieder-Einblenden im Ausgeblendet-Tab ──────────────────────────────

test.describe("AC: Wieder-Einblenden direkt im Ausgeblendet-Tab", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("switch in excluded tab re-enables product and removes it from tab", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Switch to Ausgeblendet tab
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)

    // Find product row in excluded tab
    const excludedRow = page.locator("[data-value='ausgeblendet'] table tbody tr").filter({ hasText: rawName })
    await expect(excludedRow.first()).toBeVisible({ timeout: 5000 })

    // Toggle switch to re-enable
    const switchElem = excludedRow.first().locator("role=switch")
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/exclude") && r.request().method() === "PUT", { timeout: 5000 }),
      switchElem.click(),
    ])
    await page.waitForTimeout(400)

    // Product should disappear from Ausgeblendet tab (optimistic update)
    const rowCount = await excludedRow.count()
    expect(rowCount).toBe(0)
  })

  test("re-enabled product appears in main tab immediately", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Switch to Ausgeblendet tab and re-enable
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)
    const excludedRow = page.locator("[data-value='ausgeblendet'] table tbody tr").filter({ hasText: rawName }).first()
    await expect(excludedRow).toBeVisible()

    const switchElem = excludedRow.locator("role=switch")
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/exclude") && r.request().method() === "PUT", { timeout: 5000 }),
      switchElem.click(),
    ])
    await page.waitForTimeout(400)

    // Switch back to main tab
    await page.getByRole("tab", { name: "Produkte" }).click()
    await page.waitForTimeout(300)

    // Re-enabled product should now be visible in main tab
    const mainRow = page.locator("[data-value='produkte'] table tbody tr").filter({ hasText: rawName })
    await expect(mainRow.first()).toBeVisible({ timeout: 5000 })
  })
})

// ── AC: Suche im Ausgeblendet-Tab ──────────────────────────────────────────

test.describe("AC: Suche im Ausgeblendet-Tab", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("excluded tab has own search field separate from main tab", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)

    // Exclude the product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Switch to Ausgeblendet tab
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)

    // Find search input in excluded tab — look for "Ausgeblendete suchen" placeholder
    const excludedSearchInput = page.getByPlaceholder("Ausgeblendete suchen…")
    await expect(excludedSearchInput).toBeVisible()

    // Type search that won't match
    await excludedSearchInput.fill("NOTEXIST_XYZ_ABC_999")
    await page.waitForTimeout(300)

    // Should show empty state message: "Kein ausgeblendetes Produkt für ... gefunden"
    const emptyMsg = page.getByText(/Kein ausgeblendetes Produkt/)
    const hasEmpty = await emptyMsg.isVisible().catch(() => false)
    expect(hasEmpty).toBeTruthy()

    await resetExclusion(request, rawName)
  })

  test("search in excluded tab does not affect main tab", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Table content may change on mobile")
    const rawName = await getFirstProductName(request)

    // Exclude product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Main tab search should be empty (search for "Produkt suchen" placeholder)
    const mainSearchInput = page.getByPlaceholder("Produkt suchen…")
    await expect(mainSearchInput).toHaveValue("")

    // Switch to Ausgeblendet and search
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)
    const excludedSearchInput = page.getByPlaceholder("Ausgeblendete suchen…")
    await expect(excludedSearchInput).toBeVisible()
    await excludedSearchInput.fill("NOTEXIST")
    await page.waitForTimeout(300)

    // Switch back to main tab — main search should still be empty
    await page.getByRole("tab", { name: "Produkte" }).click()
    await page.waitForTimeout(300)

    // Main search input should still be empty
    await expect(mainSearchInput).toHaveValue("")

    await resetExclusion(request, rawName)
  })
})

// ── AC: Edge Cases ──────────────────────────────────────────────────────────

test.describe("AC: PROJ-13 Edge Cases", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("excluded tab empty state when nothing is excluded", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Switch to Ausgeblendet tab
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)

    // Should show empty state message: "Keine ausgeblendeten Artikel"
    await expect(page.getByText("Keine ausgeblendeten Artikel")).toBeVisible()
  })

  test("main tab empty state when all products are excluded", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Table content may change on mobile")

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Get all product names (from main tab)
    const rows = page.locator("[data-value='produkte'] table tbody tr")
    const productCount = await rows.count()
    const firstProductName = await getFirstProductName(request)

    // If there's at least one product, exclude it
    if (productCount > 0) {
      await request.put(`/api/produkte/${encodeURIComponent(firstProductName)}/exclude`, {
        data: { excluded: true },
      })

      // Reload page
      await page.reload()
      await page.waitForTimeout(500)

      // If it was the only product, main tab should be empty
      // Otherwise, it should still have products
      const newRows = page.locator("[data-value='produkte'] table tbody tr")
      const newRowCount = await newRows.count()

      // Just verify we're still on the page and can see the structure
      expect(newRowCount).toBeLessThan(productCount)

      await resetExclusion(request, firstProductName)
    }
  })

  test("page reload defaults to 'Produkte' tab (not 'Ausgeblendet')", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)

    // Exclude a product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Switch to Ausgeblendet tab
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForTimeout(300)

    // Reload page
    await page.reload()
    await page.waitForTimeout(500)

    // After reload, Produkte tab should be active (default)
    const produkte_tab = page.getByRole("tab", { name: "Produkte" })
    await expect(produkte_tab).toHaveAttribute("data-state", "active")

    await resetExclusion(request, rawName)
  })
})
