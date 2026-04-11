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

interface ProductInfo {
  raw_name: string
  purchase_count: number
}

async function getProducts(request: import("@playwright/test").APIRequestContext): Promise<ProductInfo[]> {
  const res = await request.get("/api/produkte?sort=frequency")
  const data = await res.json()
  return data.products as ProductInfo[]
}

/** Find the first product (by frequency) that has gesamt != null (≥ 2 purchases) */
async function findMultiPurchaseProduct(
  request: import("@playwright/test").APIRequestContext
): Promise<string | null> {
  const products = await getProducts(request)
  for (const p of products.slice(0, 20)) {
    const res = await request.get(`/api/produkte/${encodeURIComponent(p.raw_name)}/preisentwicklung`)
    const data = await res.json()
    if (data.gesamt !== null) return p.raw_name
  }
  return null
}

/** Find the first product that has purchases in ≥ 2 different years */
async function findMultiYearProduct(
  request: import("@playwright/test").APIRequestContext
): Promise<{ raw_name: string; jahre: number } | null> {
  const products = await getProducts(request)
  for (const p of products.slice(0, 20)) {
    const res = await request.get(`/api/produkte/${encodeURIComponent(p.raw_name)}/preisentwicklung`)
    const data = await res.json()
    if (data.jahre.length >= 2) return { raw_name: p.raw_name, jahre: data.jahre.length }
  }
  return null
}

/** Opens the price chart sheet for a specific product by searching for it.
 *  Returns after both price data and analysis data have been fetched. */
async function openChartForProduct(
  page: import("@playwright/test").Page,
  rawName: string
) {
  await page.goto("/produkte")
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

  // Search for the specific product to ensure it's first in the list
  await page.getByPlaceholder("Produkt suchen…").fill(rawName)
  await page.waitForResponse((res) => res.url().includes("/api/produkte?") && res.status() === 200)
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5000 })

  const chartBtn = page.locator("table tbody tr").first().getByTitle("Preisentwicklung anzeigen")
  await expect(chartBtn).toBeVisible({ timeout: 5000 })

  // Register response listeners BEFORE clicking
  const preisePromise = page.waitForResponse(
    (res) => res.url().includes("/preise") && !res.url().includes("preisentwicklung") && res.status() === 200,
    { timeout: 15000 }
  )
  const analysisPromise = page.waitForResponse(
    (res) => res.url().includes("/preisentwicklung") && res.status() === 200,
    { timeout: 15000 }
  )
  await chartBtn.click()
  await preisePromise
  await analysisPromise
  // In dev mode React.StrictMode double-invokes effects — wait for the second
  // preisentwicklung fetch so the component renders stably before asserting.
  await page.waitForResponse(
    (res) => res.url().includes("/preisentwicklung") && res.status() === 200,
    { timeout: 8000 }
  ).catch(() => { /* no second fetch = already stable */ })
  await page.waitForTimeout(800)
}

// ── AC: API /api/produkte/[name]/preisentwicklung ────────────────────────────

test.describe("AC: API /api/produkte/[name]/preisentwicklung", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("returns correct response structure for known product", async ({ request }) => {
    const products = await getProducts(request)
    const rawName = products[0]?.raw_name
    if (!rawName) { test.skip(true, "No products in DB"); return }

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preisentwicklung`)
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data).toHaveProperty("gesamt")
    expect(data).toHaveProperty("jahre")
    expect(Array.isArray(data.jahre)).toBe(true)
  })

  test("returns gesamt=null for unknown product (< 2 purchases)", async ({ request }) => {
    const res = await request.get("/api/produkte/DOES_NOT_EXIST_99999/preisentwicklung")
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.gesamt).toBeNull()
    expect(data.jahre).toHaveLength(0)
  })

  test("gesamt fields have correct shape when product has ≥ 2 purchases", async ({ request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No product with ≥ 2 purchases in test data"); return }

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preisentwicklung`)
    const data = await res.json()

    expect(data.gesamt).not.toBeNull()
    expect(data.gesamt.erster_kauf).toHaveProperty("datum")
    expect(data.gesamt.erster_kauf).toHaveProperty("preis_cents")
    expect(data.gesamt.letzter_kauf).toHaveProperty("datum")
    expect(data.gesamt.letzter_kauf).toHaveProperty("preis_cents")
    expect(typeof data.gesamt.veraenderung_cents).toBe("number")
    expect(typeof data.gesamt.veraenderung_prozent).toBe("number")
    expect(data.gesamt.erster_kauf.preis_cents).toBeGreaterThan(0)
    expect(data.gesamt.letzter_kauf.preis_cents).toBeGreaterThan(0)
  })

  test("jahre array has correct shape: first entry has null veraenderung", async ({ request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No product with ≥ 2 purchases"); return }

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preisentwicklung`)
    const data = await res.json()

    expect(data.jahre.length).toBeGreaterThanOrEqual(1)
    const first = data.jahre[0]
    expect(first).toHaveProperty("jahr")
    expect(first).toHaveProperty("avg_preis_cents")
    expect(first.veraenderung_cents).toBeNull()
    expect(first.veraenderung_prozent).toBeNull()

    if (data.jahre.length > 1) {
      const second = data.jahre[1]
      expect(typeof second.veraenderung_cents).toBe("number")
      expect(typeof second.veraenderung_prozent).toBe("number")
    }
  })

  test("jahre entries are sorted by year ascending", async ({ request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No product with ≥ 2 purchases"); return }

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preisentwicklung`)
    const data = await res.json()

    for (let i = 1; i < data.jahre.length; i++) {
      expect(data.jahre[i].jahr).toBeGreaterThan(data.jahre[i - 1].jahr)
    }
  })

  test("erster_kauf.datum <= letzter_kauf.datum (chronological order)", async ({ request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No product with ≥ 2 purchases"); return }

    const res = await request.get(`/api/produkte/${encodeURIComponent(rawName)}/preisentwicklung`)
    const data = await res.json()

    expect(data.gesamt.erster_kauf.datum <= data.gesamt.letzter_kauf.datum).toBe(true)
  })
})

// ── AC: Gesamt-Preissteigerung UI ────────────────────────────────────────────

test.describe("AC: Gesamt-Preissteigerung Anzeige", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Preisentwicklung section heading is shown when product has ≥ 2 purchases", async ({ page, request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No product with ≥ 2 purchases in test data"); return }

    await openChartForProduct(page, rawName)

    // Use h3 level specifically to avoid matching the SheetTitle (h2) which also says "Preisentwicklung"
    await expect(page.getByRole("heading", { name: "Preisentwicklung", level: 3 })).toBeVisible({ timeout: 8000 })
  })

  test("shows Erster Kauf and Letzter Kauf labels", async ({ page, request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No product with ≥ 2 purchases"); return }

    await openChartForProduct(page, rawName)
    const dialog = page.getByRole("dialog")

    await expect(dialog.getByText(/Erster Kauf/)).toBeVisible({ timeout: 8000 })
    await expect(dialog.getByText(/Letzter Kauf/)).toBeVisible({ timeout: 8000 })
  })

  test("percentage badge contains % sign and 'seit erstem Kauf'", async ({ page, request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No product with ≥ 2 purchases"); return }

    await openChartForProduct(page, rawName)
    const dialog = page.getByRole("dialog")

    await expect(dialog.getByText(/seit erstem Kauf/)).toBeVisible({ timeout: 8000 })
    const badgeText = await dialog.getByText(/seit erstem Kauf/).innerText()
    expect(badgeText).toContain("%")
  })

  test("Preisentwicklung section is NOT shown for single-purchase product", async ({ page, request }) => {
    const products = await getProducts(request)
    const singlePurchase = products.find((p) => p.purchase_count === 1)

    if (!singlePurchase) {
      test.skip(true, "No single-purchase product in test data")
      return
    }

    await openChartForProduct(page, singlePurchase.raw_name)
    const dialog = page.getByRole("dialog")

    await expect(dialog.getByText("Nur ein Kauf vorhanden")).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText("Preisentwicklung")).not.toBeVisible()
  })
})

// ── AC: Jahr-zu-Jahr-Vergleich UI ────────────────────────────────────────────

test.describe("AC: Jahr-zu-Jahr-Vergleich Tabelle", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("shows 'Noch keine jahresübergreifenden Daten' for single-year product", async ({ page, request }) => {
    // Find a product with gesamt != null (2+ purchases) but only 1 year
    const products = await getProducts(request)
    let singleYearProduct: string | null = null
    for (const p of products.slice(0, 20)) {
      try {
        const res = await request.get(`/api/produkte/${encodeURIComponent(p.raw_name)}/preisentwicklung`)
        if (!res.ok()) continue
        const data = await res.json()
        if (data.gesamt !== null && Array.isArray(data.jahre) && data.jahre.length === 1) {
          singleYearProduct = p.raw_name
          break
        }
      } catch {
        continue
      }
    }

    if (!singleYearProduct) {
      test.skip(true, "No product with ≥2 purchases in exactly 1 year")
      return
    }

    await openChartForProduct(page, singleYearProduct)
    const dialog = page.getByRole("dialog")

    await expect(dialog.locator("p").filter({ hasText: /jahres.*bergreifenden Daten/i })).toBeVisible({ timeout: 15000 })
  })

  test("shows year table with correct headers for multi-year product", async ({ page, request }) => {
    const result = await findMultiYearProduct(request)
    if (!result) {
      test.skip(true, "No product with purchases in ≥ 2 years in test data")
      return
    }

    await openChartForProduct(page, result.raw_name)
    const dialog = page.getByRole("dialog")

    // Check that the table is rendered inside the dialog (aria-modal dialog can
    // interfere with page-level role queries; use CSS selectors instead)
    await expect(dialog.locator("table")).toBeVisible({ timeout: 15000 })
    // Check column headers by text inside the dialog's table header cells
    await expect(dialog.locator("thead th").filter({ hasText: /^Jahr$/ })).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator("thead th").filter({ hasText: "Zum Vorjahr" })).toBeVisible({ timeout: 5000 })
  })

  test("first year row shows '—' (no prior year comparison)", async ({ page, request }) => {
    const result = await findMultiYearProduct(request)
    if (!result) {
      test.skip(true, "No product with purchases in ≥ 2 years")
      return
    }

    await openChartForProduct(page, result.raw_name)
    const dialog = page.getByRole("dialog")

    // First year row shows "—" in the Zum Vorjahr column
    await expect(dialog.locator("tbody td").filter({ hasText: /^—$/ }).first()).toBeVisible({ timeout: 15000 })
  })
})

// ── Security Audit ───────────────────────────────────────────────────────────

test.describe("Security: preisentwicklung API", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("SQL injection via product name is harmless", async ({ request }) => {
    const malicious = "'; DROP TABLE receipts; --"
    const res = await request.get(`/api/produkte/${encodeURIComponent(malicious)}/preisentwicklung`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.gesamt).toBeNull()

    // Verify DB is intact
    const bonsRes = await request.get("/api/bons")
    expect(bonsRes.status()).toBe(200)
  })

  test("special characters and umlauts in product name are handled safely", async ({ request }) => {
    const special = "PRODUKT MIT SONDERZEICHEN äöüÄÖÜß"
    const res = await request.get(`/api/produkte/${encodeURIComponent(special)}/preisentwicklung`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.gesamt).toBeNull()
    expect(data.jahre).toHaveLength(0)
  })

  test("very long product name does not cause server error", async ({ request }) => {
    const longName = "A".repeat(500)
    const res = await request.get(`/api/produkte/${encodeURIComponent(longName)}/preisentwicklung`)
    expect(res.status()).toBe(200)
  })
})

// ── Regression: Existing chart UI intact ────────────────────────────────────

test.describe("Regression: Existing chart UI intact after PROJ-9 changes", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("summary stats (Niedrigster/Durchschnitt/Höchster) still render", async ({ page, request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No multi-purchase product"); return }

    await openChartForProduct(page, rawName)
    const dialog = page.getByRole("dialog")

    await expect(dialog.getByText("Niedrigster")).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText("Durchschnitt")).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText("Höchster")).toBeVisible({ timeout: 5000 })
  })

  test("chart legend (Normaler Kauf / Mit Rabatt) still renders", async ({ page, request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No multi-purchase product"); return }

    await openChartForProduct(page, rawName)
    const dialog = page.getByRole("dialog")

    await expect(dialog.getByText("Normaler Kauf")).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText("Mit Rabatt")).toBeVisible({ timeout: 5000 })
  })

  test("product switcher combobox still functional", async ({ page, request }) => {
    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No multi-purchase product"); return }

    await openChartForProduct(page, rawName)
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("combobox")).toBeVisible({ timeout: 5000 })
  })
})

// ── Responsive ───────────────────────────────────────────────────────────────

test.describe("Responsive: Preisentwicklung section", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("price chart sheet opens on mobile (375px) with combobox accessible", async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    const rawName = await findMultiPurchaseProduct(request)
    if (!rawName) { test.skip(true, "No multi-purchase product"); return }

    await openChartForProduct(page, rawName)

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByRole("combobox")).toBeVisible()
  })
})
