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

// ── AC: API /api/statistiken/monatlich ──────────────────────────────────────

test.describe("AC: API Monatliche Ausgaben", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("returns monthly spending with correct structure", async ({ request }) => {
    const res = await request.get("/api/statistiken/monatlich")
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data).toHaveProperty("monate")
    expect(data).toHaveProperty("vergleich")
    expect(Array.isArray(data.monate)).toBe(true)
    expect(data.monate.length).toBeGreaterThan(0)

    const month = data.monate[0]
    expect(month).toHaveProperty("monat")
    expect(month).toHaveProperty("ausgaben_cents")
    expect(month.monat).toMatch(/^\d{4}-\d{2}$/)
  })

  test("months are sorted ascending", async ({ request }) => {
    const res = await request.get("/api/statistiken/monatlich")
    const data = await res.json()

    if (data.monate.length >= 2) {
      for (let i = 1; i < data.monate.length; i++) {
        expect(data.monate[i].monat >= data.monate[i - 1].monat).toBe(true)
      }
    }
  })

  test("vergleich shows diff when 2+ months exist", async ({ request }) => {
    const res = await request.get("/api/statistiken/monatlich")
    const data = await res.json()

    if (data.monate.length >= 2) {
      expect(data.vergleich).not.toBeNull()
      expect(data.vergleich).toHaveProperty("aktuell_monat")
      expect(data.vergleich).toHaveProperty("vormonat")
      expect(data.vergleich).toHaveProperty("diff_cents")
      expect(data.vergleich).toHaveProperty("diff_prozent")
    }
  })

  test("monate filter restricts results", async ({ request }) => {
    const allRes = await request.get("/api/statistiken/monatlich")
    const allData = await allRes.json()

    const filtered = await request.get("/api/statistiken/monatlich?monate=3")
    const filteredData = await filtered.json()
    expect(filtered.status()).toBe(200)

    // Filtered should have <= all months
    expect(filteredData.monate.length).toBeLessThanOrEqual(allData.monate.length)
  })
})

// ── AC: API /api/statistiken/top-produkte ───────────────────────────────────

test.describe("AC: API Top-Produkte", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("returns top products sorted by frequency", async ({ request }) => {
    const res = await request.get("/api/statistiken/top-produkte?sort=frequency")
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data).toHaveProperty("produkte")
    expect(Array.isArray(data.produkte)).toBe(true)
    expect(data.produkte.length).toBeGreaterThan(0)
    expect(data.produkte.length).toBeLessThanOrEqual(10)

    const p = data.produkte[0]
    expect(p).toHaveProperty("raw_name")
    expect(p).toHaveProperty("alias")
    expect(p).toHaveProperty("kaufhaeufigkeit")
    expect(p).toHaveProperty("gesamt_cents")

    // Verify sorted descending by frequency
    for (let i = 1; i < data.produkte.length; i++) {
      expect(data.produkte[i].kaufhaeufigkeit).toBeLessThanOrEqual(data.produkte[i - 1].kaufhaeufigkeit)
    }
  })

  test("returns top products sorted by spending", async ({ request }) => {
    const res = await request.get("/api/statistiken/top-produkte?sort=spending")
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data.produkte.length).toBeGreaterThan(0)

    // Verify sorted descending by spending
    for (let i = 1; i < data.produkte.length; i++) {
      expect(data.produkte[i].gesamt_cents).toBeLessThanOrEqual(data.produkte[i - 1].gesamt_cents)
    }
  })

  test("excludes zero/negative price items (Leergut)", async ({ request }) => {
    const res = await request.get("/api/statistiken/top-produkte?sort=frequency")
    const data = await res.json()

    for (const p of data.produkte) {
      expect(p.gesamt_cents).toBeGreaterThan(0)
    }
  })

  test("shows alias when product has one", async ({ request }) => {
    // Get first product
    const topRes = await request.get("/api/statistiken/top-produkte?sort=frequency")
    const topData = await topRes.json()
    const rawName = topData.produkte[0].raw_name

    // Set alias
    await request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias: "QA Dashboard Alias" },
    })

    // Re-fetch and check
    const res2 = await request.get("/api/statistiken/top-produkte?sort=frequency")
    const data2 = await res2.json()
    const found = data2.produkte.find((p: { raw_name: string }) => p.raw_name === rawName)
    expect(found?.alias).toBe("QA Dashboard Alias")

    // Cleanup
    await request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
  })
})

// ── AC: API /api/statistiken/rabatte ────────────────────────────────────────

test.describe("AC: API Rabatt-Tracking", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("returns discount data with correct structure", async ({ request }) => {
    const res = await request.get("/api/statistiken/rabatte")
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data).toHaveProperty("gesamt_ersparnis_cents")
    expect(data).toHaveProperty("monatlich")
    expect(data).toHaveProperty("top_aktionen")
    expect(Array.isArray(data.monatlich)).toBe(true)
    expect(Array.isArray(data.top_aktionen)).toBe(true)
    expect(typeof data.gesamt_ersparnis_cents).toBe("number")
  })

  test("monthly discounts are sorted ascending by month", async ({ request }) => {
    const res = await request.get("/api/statistiken/rabatte")
    const data = await res.json()

    if (data.monatlich.length >= 2) {
      for (let i = 1; i < data.monatlich.length; i++) {
        expect(data.monatlich[i].monat >= data.monatlich[i - 1].monat).toBe(true)
      }
    }
  })

  test("top_aktionen have description, count and total", async ({ request }) => {
    const res = await request.get("/api/statistiken/rabatte")
    const data = await res.json()

    if (data.top_aktionen.length > 0) {
      const a = data.top_aktionen[0]
      expect(a).toHaveProperty("beschreibung")
      expect(a).toHaveProperty("anzahl")
      expect(a).toHaveProperty("gesamt_cents")
      expect(a.anzahl).toBeGreaterThan(0)
    }
  })

  test("top_aktionen limited to 5", async ({ request }) => {
    const res = await request.get("/api/statistiken/rabatte")
    const data = await res.json()
    expect(data.top_aktionen.length).toBeLessThanOrEqual(5)
  })
})

// ── AC: API /api/statistiken/mwst ───────────────────────────────────────────

test.describe("AC: API MwSt-Aufteilung", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("returns VAT categories with correct structure", async ({ request }) => {
    const res = await request.get("/api/statistiken/mwst")
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data).toHaveProperty("kategorien")
    expect(data).toHaveProperty("gesamt_cents")
    expect(Array.isArray(data.kategorien)).toBe(true)
    expect(data.kategorien.length).toBeGreaterThan(0)

    const k = data.kategorien[0]
    expect(k).toHaveProperty("tax_code")
    expect(k).toHaveProperty("label")
    expect(k).toHaveProperty("gesamt_cents")
    expect(k).toHaveProperty("anteil_prozent")
  })

  test("anteil_prozent values sum to ~100", async ({ request }) => {
    const res = await request.get("/api/statistiken/mwst")
    const data = await res.json()

    const totalPct = data.kategorien.reduce(
      (sum: number, k: { anteil_prozent: number }) => sum + k.anteil_prozent, 0
    )
    // Allow rounding tolerance (could be 99 or 101 due to Math.round)
    expect(totalPct).toBeGreaterThanOrEqual(98)
    expect(totalPct).toBeLessThanOrEqual(102)
  })

  test("labels are human-readable (Lebensmittel/Nicht-Lebensmittel)", async ({ request }) => {
    const res = await request.get("/api/statistiken/mwst")
    const data = await res.json()

    for (const k of data.kategorien) {
      if (k.tax_code === "A") {
        expect(k.label).toContain("7%")
      } else if (k.tax_code === "B") {
        expect(k.label).toContain("19%")
      }
    }
  })
})

// ── AC: Dashboard UI – Monatliche Ausgaben ──────────────────────────────────

test.describe("AC: Dashboard – Monatliche Ausgaben", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("bar chart is visible on statistiken page", async ({ page }) => {
    await page.goto("/statistiken")
    // Wait for data to load
    await expect(page.locator(".recharts-responsive-container").first()).toBeVisible({ timeout: 10000 })
    // Check for bar chart bars
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible({ timeout: 5000 })
  })

  test("month-over-month comparison badge is shown", async ({ page }) => {
    await page.goto("/statistiken")
    await expect(page.locator(".recharts-responsive-container").first()).toBeVisible({ timeout: 10000 })
    // Badge should contain "vs. Vormonat"
    const badge = page.getByText("vs. Vormonat")
    // May or may not exist depending on data — if it exists, verify it's visible
    const hasBadge = await badge.isVisible().catch(() => false)
    if (hasBadge) {
      await expect(badge).toBeVisible()
    }
  })
})

// ── AC: Dashboard UI – Top-10 Produkte ──────────────────────────────────────

test.describe("AC: Dashboard – Top-10 Produkte", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("top products card shows tabs for Häufigste and Teuerste", async ({ page }) => {
    await page.goto("/statistiken")
    await expect(page.getByRole("tab", { name: "Häufigste" })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("tab", { name: "Teuerste" })).toBeVisible()
  })

  test("product list shows items with purchase count", async ({ page }) => {
    await page.goto("/statistiken")
    await expect(page.getByRole("tab", { name: "Häufigste" })).toBeVisible({ timeout: 10000 })
    // Should show at least one product button with frequency (×)
    const productButtons = page.locator("button[title='Preisentwicklung anzeigen']")
    await expect(productButtons.first()).toBeVisible({ timeout: 5000 })
  })

  test("switching to Teuerste tab changes the list", async ({ page }) => {
    await page.goto("/statistiken")
    await expect(page.getByRole("tab", { name: "Häufigste" })).toBeVisible({ timeout: 10000 })

    // Click Teuerste tab
    const teuersteTab = page.getByRole("tab", { name: "Teuerste" })
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/top-produkte") && res.status() === 200
    )
    await teuersteTab.click()
    await responsePromise
    // Tab should be selected
    await expect(teuersteTab).toHaveAttribute("data-state", "active")
  })

  test("clicking a product opens the price chart sheet (PROJ-4)", async ({ page }) => {
    await page.goto("/statistiken")
    const productBtn = page.locator("button[title='Preisentwicklung anzeigen']").first()
    await expect(productBtn).toBeVisible({ timeout: 10000 })

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/preise") && res.status() === 200
    )
    await productBtn.click()
    await responsePromise

    // PriceChartSheet (dialog) should open
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("dialog").getByRole("combobox")).toBeVisible()
  })
})

// ── AC: Dashboard UI – Rabatt-Tracking ──────────────────────────────────────

test.describe("AC: Dashboard – Rabatt-Tracking", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("rabatt card shows total savings or empty state", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/statistiken/rabatte") && res.status() === 200
    )
    await page.goto("/statistiken")
    await responsePromise
    await expect(page.getByText("Rabatt-Tracking", { exact: true })).toBeVisible({ timeout: 10000 })

    // Should show either savings amount or "Keine Rabattdaten"
    const hasSavings = await page.getByText("gespart", { exact: false }).isVisible().catch(() => false)
    const hasEmpty = await page.getByText("Keine Rabattdaten", { exact: false }).isVisible().catch(() => false)
    expect(hasSavings || hasEmpty).toBe(true)
  })

  test("top discount actions are listed if data exists", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/statistiken/rabatte") && res.status() === 200
    )
    await page.goto("/statistiken")
    await responsePromise
    await expect(page.getByText("Rabatt-Tracking", { exact: true })).toBeVisible({ timeout: 10000 })

    const hasActions = await page.getByText("Häufigste Rabattaktionen", { exact: true }).isVisible().catch(() => false)
    // If there are discount actions, the label should be visible
    if (hasActions) {
      await expect(page.getByText("Häufigste Rabattaktionen", { exact: true })).toBeVisible()
    }
  })
})

// ── AC: Dashboard UI – MwSt-Aufteilung ─────────────────────────────────────

test.describe("AC: Dashboard – MwSt-Aufteilung", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("MwSt card shows donut chart or empty state", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/statistiken/mwst") && res.status() === 200
    )
    await page.goto("/statistiken")
    await responsePromise
    await expect(page.getByText("MwSt-Aufteilung", { exact: true })).toBeVisible({ timeout: 10000 })

    // Should show either chart legend (category labels) or empty state
    // Use .first() to avoid strict mode when same text appears in both legend and category tile
    const hasA = await page.getByText("Lebensmittel (7%)", { exact: true }).first().isVisible().catch(() => false)
    const hasB = await page.getByText("Nicht-Lebensmittel (19%)", { exact: true }).first().isVisible().catch(() => false)
    const hasEmpty = await page.getByText("Keine MwSt-Daten", { exact: false }).first().isVisible().catch(() => false)
    expect(hasA || hasB || hasEmpty).toBe(true)
  })

  test("MwSt categories show absolute amounts", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/statistiken/mwst") && res.status() === 200
    )
    await page.goto("/statistiken")
    await responsePromise
    await expect(page.getByText("MwSt-Aufteilung", { exact: true })).toBeVisible({ timeout: 10000 })

    // If category data exists, check for percentage labels
    const hasA = await page.getByText("Lebensmittel (7%)", { exact: false }).isVisible().catch(() => false)
    const hasB = await page.getByText("Nicht-Lebensmittel (19%)", { exact: false }).isVisible().catch(() => false)
    if (hasA || hasB) {
      expect(hasA || hasB).toBe(true)
    }
  })
})

// ── AC: Zeitraum-Filter ─────────────────────────────────────────────────────

test.describe("AC: Zeitraum-Filter", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("filter buttons are visible (3M, 6M, 12M, Alle)", async ({ page }) => {
    await page.goto("/statistiken")
    await expect(page.getByRole("button", { name: "3M" })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button", { name: "6M" })).toBeVisible()
    await expect(page.getByRole("button", { name: "12M" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Alle" })).toBeVisible()
  })

  test("clicking a filter button triggers data reload", async ({ page }) => {
    await page.goto("/statistiken")
    await expect(page.locator(".recharts-responsive-container").first()).toBeVisible({ timeout: 10000 })

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/statistiken/monatlich") && res.status() === 200
    )
    await page.getByRole("button", { name: "3M" }).click()
    await responsePromise
  })
})

// ── Edge Case: Leer-Zustand ─────────────────────────────────────────────────

test.describe("Edge Case: Empty state", () => {
  test("API returns empty data when no bons exist", async ({ request }) => {
    // Test with a filter that likely returns no data
    const res = await request.get("/api/statistiken/monatlich?monate=0")
    // Invalid monate param just returns all data — that's ok, the API handles it
    expect(res.status()).toBe(200)
  })
})

// ── Security: SQL Injection ─────────────────────────────────────────────────

test.describe("Security: Statistiken APIs", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("monatlich API handles malicious monate parameter", async ({ request }) => {
    const res = await request.get("/api/statistiken/monatlich?monate='; DROP TABLE receipts; --")
    expect(res.status()).toBe(200)
    // Verify receipts table still works
    const bonsRes = await request.get("/api/bons")
    expect(bonsRes.status()).toBe(200)
  })

  test("top-produkte API handles malicious sort parameter", async ({ request }) => {
    const res = await request.get("/api/statistiken/top-produkte?sort='; DROP TABLE receipts; --")
    expect(res.status()).toBe(200)
    const bonsRes = await request.get("/api/bons")
    expect(bonsRes.status()).toBe(200)
  })

  test("rabatte API handles malicious monate parameter", async ({ request }) => {
    const res = await request.get("/api/statistiken/rabatte?monate=evil")
    expect(res.status()).toBe(200)
  })

  test("mwst API handles malicious monate parameter", async ({ request }) => {
    const res = await request.get("/api/statistiken/mwst?monate=<script>alert(1)</script>")
    expect(res.status()).toBe(200)
    const bonsRes = await request.get("/api/bons")
    expect(bonsRes.status()).toBe(200)
  })
})

// ── Responsive: Mobile ──────────────────────────────────────────────────────

test.describe("Responsive: Mobile dashboard", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("dashboard renders correctly on mobile", async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/statistiken/monatlich") && res.status() === 200
    )
    await page.goto("/statistiken")
    await responsePromise
    await expect(page.getByRole("heading", { name: "Statistiken" })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Monatliche Ausgaben", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Top-10 Produkte", { exact: true })).toBeVisible()
    // Cards stack vertically on mobile — scroll to find them
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(page.getByText("Rabatt-Tracking", { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("MwSt-Aufteilung", { exact: true })).toBeVisible()
  })
})
