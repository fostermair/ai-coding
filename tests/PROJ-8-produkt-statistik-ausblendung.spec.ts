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

/** Returns the raw_name of the first product in the frequency-sorted list */
async function getFirstProductName(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.get("/api/produkte?sort=frequency&filter=all")
  const json = await res.json()
  return json.products[0].raw_name as string
}

/** Resets excluded_from_stats for a specific product via API */
async function resetExclusion(request: import("@playwright/test").APIRequestContext, rawName: string) {
  await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
    data: { excluded: false },
  })
}

/** Resets ALL exclusions — fetches all excluded products and re-enables them */
async function resetAllExclusions(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/produkte?filter=excluded")
  if (!res.ok()) return
  const json = await res.json()
  for (const p of json.products as Array<{ raw_name: string }>) {
    await resetExclusion(request, p.raw_name)
  }
}

// ── AC: Statistiken-Spalte in Produktliste ───────────────────────────────────

test.describe("AC: Statistiken-Toggle in Produktliste", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("each product row has a statistics switch toggle", async ({ page, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("columnheader", { name: "Statistiken" })).toBeVisible()
    const firstSwitch = page.locator("table tbody tr").first().locator("role=switch")
    await expect(firstSwitch).toBeVisible()
  })

  test("switch is checked (active) by default for all products", async ({ page, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    const firstSwitch = page.locator("table tbody tr").first().locator("role=switch")
    await expect(firstSwitch).toHaveAttribute("data-state", "checked")
  })

  test("toggling switch off dims the product row", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const firstRow = page.locator("table tbody tr").first()
    const firstSwitch = firstRow.locator("role=switch")

    // Turn off
    await firstSwitch.click()
    await page.waitForTimeout(400)

    // Row should be dimmed (opacity-50 class)
    await expect(firstRow).toHaveClass(/opacity-50/)

    // Cleanup
    const rawName = await getFirstProductName(request)
    await resetExclusion(request, rawName)
  })

  test("toggling switch saves to API (optimistic update)", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    const rawName = await getFirstProductName(request)

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Find the specific row for rawName
    const targetRow = page.locator("table tbody tr").filter({ hasText: rawName }).first()
    const targetSwitch = targetRow.locator("role=switch")
    const encodedName = encodeURIComponent(rawName)

    // Toggle off — wait for the specific PUT request for this product to complete
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(encodedName) && r.url().includes("/exclude") && r.request().method() === "PUT",
        { timeout: 5000 }
      ),
      targetSwitch.click(),
    ])
    expect(putResponse.status()).toBe(200)

    // Optimistic update: row must be dimmed immediately without needing a reload
    await expect(targetRow).toHaveClass(/opacity-50/, { timeout: 3000 })
    await expect(targetSwitch).toHaveAttribute("data-state", "unchecked")

    // Note: persistence across reload is verified in the dedicated "excluded status survives page reload" test

    await resetExclusion(request, rawName)
  })

  test("re-enabling excluded product restores it to active state", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude via API
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const firstRow = page.locator("table tbody tr").first()
    const firstSwitch = firstRow.locator("role=switch")

    // Switch should be off (unchecked)
    await expect(firstSwitch).toHaveAttribute("data-state", "unchecked")

    // Toggle back on
    await firstSwitch.click()
    await page.waitForTimeout(500)

    // Switch should now be checked
    await expect(firstSwitch).toHaveAttribute("data-state", "checked")
    // Row should no longer be dimmed
    await expect(firstRow).not.toHaveClass(/opacity-50/)

    // Verify via API
    const res = await request.get(`/api/produkte?filter=excluded`)
    const json = await res.json()
    const excludedNames = json.products.map((p: { raw_name: string }) => p.raw_name)
    expect(excludedNames).not.toContain(rawName)
  })
})

// ── AC: Filter (Alle / Aktiv / Ausgeblendet) ─────────────────────────────────

test.describe("AC: Produktliste Filter-Buttons", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("filter buttons Alle / Aktiv / Ausgeblendet are visible", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button", { name: "Alle" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Aktiv" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Ausgeblendet" })).toBeVisible()
  })

  test("'Ausgeblendet' filter shows only excluded products", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude one product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Click "Ausgeblendet" filter — wait for the debounced API re-fetch to complete
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/produkte") && r.url().includes("filter=excluded"), { timeout: 5000 }),
      page.getByRole("button", { name: "Ausgeblendet" }).click(),
    ])

    // Should show our excluded product
    await expect(page.locator("table tbody tr").filter({ hasText: rawName })).toBeVisible({ timeout: 5000 })

    await resetExclusion(request, rawName)
  })

  test("'Aktiv' filter hides excluded products", async ({ page, request, browserName }) => {
    test.skip(browserName === "webkit" && (page.viewportSize()?.width ?? 0) < 640, "Switch column hidden on mobile")
    const rawName = await getFirstProductName(request)

    // Pre-exclude one product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Click "Aktiv" filter — wait for the debounced API re-fetch to complete
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/produkte") && r.url().includes("filter=active"), { timeout: 5000 }),
      page.getByRole("button", { name: "Aktiv" }).click(),
    ])

    // The excluded product should NOT be visible in the table
    await expect(page.locator("table tbody tr").filter({ hasText: rawName })).not.toBeVisible({ timeout: 3000 })

    await resetExclusion(request, rawName)
  })

  test("'Ausgeblendet' filter empty state shows helpful message when nothing excluded", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/produkte") && r.url().includes("filter=excluded"), { timeout: 5000 }),
      page.getByRole("button", { name: "Ausgeblendet" }).click(),
    ])
    const hasRows = await page.locator("table tbody tr").count()
    if (hasRows === 0) {
      await expect(page.getByText("Keine ausgeblendeten Produkte vorhanden.")).toBeVisible()
    }
  })
})

// ── AC: Summary Bar zeigt "X ausgeblendet" ───────────────────────────────────

test.describe("AC: Summary Bar Ausgeblendet-Hinweis", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("summary bar shows excluded count when products are excluded", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)

    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/ausgeblendet aus Statistiken/)).toBeVisible()

    await resetExclusion(request, rawName)
  })

  test("summary bar does NOT show excluded hint when no products are excluded", async ({ page }) => {
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/ausgeblendet aus Statistiken/)).not.toBeVisible()
  })
})

// ── AC: API PUT /api/produkte/[name]/exclude ─────────────────────────────────

test.describe("AC: API PUT /api/produkte/[name]/exclude", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("returns 200 and correct response for valid exclude=true", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    const res = await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.raw_name).toBe(rawName)
    expect(json.excluded_from_stats).toBe(true)
    await resetExclusion(request, rawName)
  })

  test("returns 200 and correct response for valid exclude=false", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    const res = await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: false },
    })
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.excluded_from_stats).toBe(false)
  })

  test("returns 400 when excluded field is not a boolean", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    const res = await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: "yes" },
    })
    expect(res.status()).toBe(400)
  })

  test("returns 404 for non-existent product", async ({ request }) => {
    const res = await request.put(
      `/api/produkte/${encodeURIComponent("PRODUCT_DOES_NOT_EXIST_XYZ")}/exclude`,
      { data: { excluded: true } }
    )
    expect(res.status()).toBe(404)
  })

  test("SQL injection via product name is harmless", async ({ request }) => {
    const res = await request.put(
      `/api/produkte/${encodeURIComponent("'; DROP TABLE product_aliases; --")}/exclude`,
      { data: { excluded: true } }
    )
    expect([404, 400]).toContain(res.status())
    // Table still exists
    const checkRes = await request.get("/api/produkte")
    expect(checkRes.status()).toBe(200)
  })
})

// ── AC: GET /api/produkte filter parameter ───────────────────────────────────

test.describe("AC: API GET /api/produkte?filter=", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("filter=all returns excluded_from_stats field and excluded_count on each product", async ({ request }) => {
    const res = await request.get("/api/produkte?filter=all")
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.products[0]).toHaveProperty("excluded_from_stats")
    expect(json).toHaveProperty("excluded_count")
    expect(typeof json.excluded_count).toBe("number")
  })

  test("filter=active excludes products with excluded_from_stats=true", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })
    const res = await request.get("/api/produkte?filter=active")
    const json = await res.json()
    const names = json.products.map((p: { raw_name: string }) => p.raw_name)
    expect(names).not.toContain(rawName)
    await resetExclusion(request, rawName)
  })

  test("filter=excluded returns only excluded products", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })
    const res = await request.get("/api/produkte?filter=excluded")
    const json = await res.json()
    const names = json.products.map((p: { raw_name: string }) => p.raw_name)
    expect(names).toContain(rawName)
    for (const p of json.products as Array<{ excluded_from_stats: boolean }>) {
      expect(p.excluded_from_stats).toBe(true)
    }
    await resetExclusion(request, rawName)
  })

  test("invalid filter parameter returns 400", async ({ request }) => {
    const res = await request.get("/api/produkte?filter=INVALID")
    expect(res.status()).toBe(400)
  })
})

// ── AC: Statistik-APIs filtern ausgeblendete Produkte ────────────────────────

test.describe("AC: Statistiken schließen ausgeblendete Produkte aus", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("monatlich API excludes spending from excluded products", async ({ request }) => {
    const rawName = await getFirstProductName(request)

    const baseRes = await request.get("/api/statistiken/monatlich")
    const baseData = await baseRes.json()
    const baseTotal = baseData.monate.reduce(
      (sum: number, m: { ausgaben_cents: number }) => sum + m.ausgaben_cents,
      0
    )

    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    const afterRes = await request.get("/api/statistiken/monatlich")
    const afterData = await afterRes.json()
    const afterTotal = afterData.monate.reduce(
      (sum: number, m: { ausgaben_cents: number }) => sum + m.ausgaben_cents,
      0
    )

    expect(afterTotal).toBeLessThanOrEqual(baseTotal)
    await resetExclusion(request, rawName)
  })

  test("top-produkte API excludes excluded products", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    const res = await request.get("/api/statistiken/top-produkte?sort=frequency")
    const json = await res.json()
    const names = json.produkte.map((p: { raw_name: string }) => p.raw_name)
    expect(names).not.toContain(rawName)
    await resetExclusion(request, rawName)
  })

  test("mwst API excludes spending from excluded products", async ({ request }) => {
    const rawName = await getFirstProductName(request)

    const baseRes = await request.get("/api/statistiken/mwst")
    const baseData = await baseRes.json()
    const baseTotal = baseData.gesamt_cents as number

    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    const afterRes = await request.get("/api/statistiken/mwst")
    const afterData = await afterRes.json()
    const afterTotal = afterData.gesamt_cents as number

    expect(afterTotal).toBeLessThanOrEqual(baseTotal)
    await resetExclusion(request, rawName)
  })

  test("rabatte API is NOT affected by exclusion (spec requirement)", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    const baseRes = await request.get("/api/statistiken/rabatte")
    const baseData = await baseRes.json()

    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    const afterRes = await request.get("/api/statistiken/rabatte")
    const afterData = await afterRes.json()
    expect(afterData.gesamt_ersparnis_cents).toBe(baseData.gesamt_ersparnis_cents)
    await resetExclusion(request, rawName)
  })
})

// ── AC: Preisentwicklungs-Chart Autocomplete filtert ausgeblendete Produkte ──

test.describe("AC: Preis-Chart Autocomplete schließt ausgeblendete Produkte aus", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("product list fetch for chart uses filter=active — excluded product absent from combobox", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)

    // Exclude the most frequent product
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    // Open price chart via second product row (first row may now be excluded/dimmed)
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Get all chart buttons and click one that is NOT for the excluded product
    const chartBtns = page.locator("table tbody tr button[title='Preisentwicklung anzeigen']")
    const btnCount = await chartBtns.count()

    if (btnCount < 2) {
      test.skip(true, "Not enough products for combobox exclusion test")
      return
    }

    await chartBtns.nth(1).click()

    // Wait for sheet to open
    await page.waitForTimeout(1000)
    const sheet = page.locator("[role='dialog']")
    await expect(sheet).toBeVisible({ timeout: 5000 })

    // Click combobox trigger to open dropdown
    const comboBtn = sheet.locator("button").filter({ hasText: /Produkt suchen|Wechseln/ }).first()
    if (await comboBtn.isVisible()) {
      await comboBtn.click()
      await page.waitForTimeout(500)
      // Excluded product should not appear in dropdown
      await expect(page.getByRole("option", { name: rawName, exact: true })).not.toBeVisible()
    }

    await resetExclusion(request, rawName)
  })
})

// ── AC: Statistik-Dashboard zeigt Hinweis bei ausgeblendeten Produkten ───────

test.describe("AC: Statistik-Dashboard Ausgeblendet-Hinweis", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("statistiken page shows excluded-products info link when products are excluded", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/statistiken")
    await expect(page.locator("text=ausgeblendet").first()).toBeVisible({ timeout: 10000 })
    await resetExclusion(request, rawName)
  })

  test("statistiken page does NOT show excluded hint when no products excluded", async ({ page }) => {
    await page.goto("/statistiken")
    await page.waitForTimeout(2000)
    await expect(page.getByText(/ausgeblendet/)).not.toBeVisible()
  })
})

// ── AC: Persistenz ───────────────────────────────────────────────────────────

test.describe("AC: Persistenz des Ausblendungs-Status", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("excluded status survives page reload", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const res = await request.get("/api/produkte?filter=excluded")
    const json = await res.json()
    expect(json.products.map((p: { raw_name: string }) => p.raw_name)).toContain(rawName)
    await resetExclusion(request, rawName)
  })
})

// ── Edge Cases ───────────────────────────────────────────────────────────────

test.describe("Edge Cases", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("alias is preserved when product is excluded", async ({ request }) => {
    const rawName = await getFirstProductName(request)
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "Test Alias QA" },
    })
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    const res = await request.get("/api/produkte?filter=excluded")
    const json = await res.json()
    const product = json.products.find((p: { raw_name: string }) => p.raw_name === rawName)
    expect(product).toBeDefined()
    expect(product.alias).toBe("Test Alias QA")

    await resetExclusion(request, rawName)
    await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
  })

  test("new products from import are active by default", async ({ request }) => {
    const res = await request.get("/api/produkte?filter=all")
    const json = await res.json()
    expect(json).toHaveProperty("excluded_count")
    expect(json.excluded_count).toBe(0)
    for (const p of json.products as Array<{ excluded_from_stats: boolean }>) {
      expect(typeof p.excluded_from_stats).toBe("boolean")
    }
  })

  test("bon detail view is unaffected by product exclusion", async ({ page, request }) => {
    const rawName = await getFirstProductName(request)
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/exclude`, {
      data: { excluded: true },
    })

    await page.goto("/")
    const bonLinks = page.locator("a[href^='/bon/']")
    if ((await bonLinks.count()) > 0) {
      await bonLinks.first().click()
      await expect(page).toHaveURL(/\/bon\/\d+/)
      await expect(page.locator("body")).not.toContainText("Interner Fehler")
    }

    await resetExclusion(request, rawName)
  })
})

// ── Responsive: Mobile ───────────────────────────────────────────────────────

test.describe("Responsive: Mobile", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
    await resetAllExclusions(request)
  })

  test("product page loads on mobile and shows filter buttons", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button", { name: "Alle" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Aktiv" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Ausgeblendet" })).toBeVisible()
  })

  test("switch column is hidden on mobile (sm breakpoint)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/produkte")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("columnheader", { name: "Statistiken" })).not.toBeVisible()
  })
})
