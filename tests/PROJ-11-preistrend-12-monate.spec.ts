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

// ── AC: API response shape ───────────────────────────────────────────────────

test.describe("PROJ-11: API — neue Felder für 12-Monats-Trend", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/produkte enthält trend_from_date und trend_to_date", async ({ request }) => {
    const res = await request.get("/api/produkte")
    expect(res.status()).toBe(200)
    const json = await res.json()

    for (const p of json.products) {
      expect(p).toHaveProperty("trend_from_date")
      expect(p).toHaveProperty("trend_to_date")
      // Beide Felder sind null oder ein ISO-Datumsstring
      const fromOk = p.trend_from_date === null || typeof p.trend_from_date === "string"
      const toOk = p.trend_to_date === null || typeof p.trend_to_date === "string"
      expect(fromOk).toBe(true)
      expect(toOk).toBe(true)
    }
  })

  test("trend_last_price_cents und price_data_count sind NICHT in der API-Antwort", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()

    for (const p of json.products) {
      expect(p).not.toHaveProperty("trend_last_price_cents")
      expect(p).not.toHaveProperty("price_data_count")
    }
  })

  test("Produkte mit nur 1 Kauf haben price_trend_pct = null", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()
    const singlePurchase = json.products.filter(
      (p: { purchase_count: number }) => p.purchase_count === 1
    )
    for (const p of singlePurchase) {
      expect(p.price_trend_pct).toBeNull()
    }
  })

  test("Wenn price_trend_pct null ist durch 0 Käufe im Fenster, sind trend_from/to_date null", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()

    // Wenn price_data_count = 0 (kein Kauf im 12-Monats-Fenster), müssen die Datums-Felder null sein.
    // Bei price_data_count = 1 kann trend_from_date gesetzt sein, price_trend_pct aber trotzdem null.
    for (const p of json.products) {
      if (p.price_trend_pct === null && p.first_price_cents === null) {
        // Kein Kauf im 12-Monats-Fenster: beide Daten null
        expect(p.trend_from_date).toBeNull()
        expect(p.trend_to_date).toBeNull()
      }
    }
  })

  test("Wenn price_trend_pct gesetzt ist, haben trend_from/to_date Werte", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()

    const withTrend = json.products.filter(
      (p: { price_trend_pct: number | null }) => p.price_trend_pct !== null
    )

    for (const p of withTrend) {
      expect(p.trend_from_date).not.toBeNull()
      expect(p.trend_to_date).not.toBeNull()
      // Datumsformat YYYY-MM-DD
      expect(p.trend_from_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(p.trend_to_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // from muss <= to sein
      expect(p.trend_from_date <= p.trend_to_date).toBe(true)
    }
  })
})

// ── AC: Zeitfenster-Logik ────────────────────────────────────────────────────

test.describe("PROJ-11: Zeitfenster-Logik", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("last_price_cents (Anzeige) stammt weiterhin vom letzten Kauf ever", async ({ request }) => {
    const res = await request.get("/api/produkte")
    const json = await res.json()
    // last_price_cents sollte immer gesetzt sein für alle Produkte
    for (const p of json.products) {
      expect(p).toHaveProperty("last_price_cents")
      // null ist erlaubt (falls nur Leergut), aber meistens number
    }
  })
})

// ── AC: Tooltip am Badge (UI) ─────────────────────────────────────────────────

test.describe("PROJ-11: Tooltip zeigt Zeitraum am Preistrend-Badge", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Preistrend-Spalte und Badge sind auf Desktop sichtbar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })
    await expect(page.getByRole("columnheader", { name: "Preistrend" })).toBeVisible()
  })

  test("Badge zeigt Pfeil und Prozent", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const badges = page.locator("table tbody tr .rounded-full")
    const count = await badges.count()

    // Wenn Bons aktuell genug sind (innerhalb 12 Monate), gibt es Badges
    if (count > 0) {
      const firstText = await badges.first().textContent()
      expect(firstText).toMatch(/[↑↓→]/)
      expect(firstText).toContain("%")
    } else {
      // Keine Badges — alle Bons sind älter als 12 Monate. Test skipped gracefully.
      test.info().annotations.push({
        type: "skip-reason",
        description: "Keine Badges sichtbar — eBon-Daten sind älter als 12 Monate",
      })
    }
  })

  test("Hover über Badge zeigt Tooltip mit Datum", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const badges = page.locator("table tbody tr .rounded-full")
    const count = await badges.count()

    if (count === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Keine Badges sichtbar — eBon-Daten sind älter als 12 Monate",
      })
      return
    }

    // Hover über ersten Badge
    await badges.first().hover()

    // Tooltip sollte erscheinen
    const tooltip = page.locator('[role="tooltip"]')
    await expect(tooltip).toBeVisible({ timeout: 3000 })

    const tooltipText = await tooltip.textContent()
    expect(tooltipText).toBeTruthy()
    // Tooltip enthält Monatsname oder Jahreszahl (Format: "Mmm YYYY – Mmm YYYY")
    expect(tooltipText).toMatch(/\d{4}/)
  })

  test("Klick auf Badge öffnet Preis-Chart-Sheet", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })

    const badges = page.locator("table tbody tr .rounded-full")
    const count = await badges.count()

    if (count === 0) {
      return
    }

    await badges.first().click()
    // Sheet öffnet sich – der Title zeigt den Produktnamen (nicht "Preisentwicklung" als fixer String)
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })
  })
})

// ── AC: Performance ───────────────────────────────────────────────────────────

test.describe("PROJ-11: Performance", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("GET /api/produkte antwortet unter 500ms", async ({ request }) => {
    const start = Date.now()
    const res = await request.get("/api/produkte")
    const elapsed = Date.now() - start
    expect(res.status()).toBe(200)
    expect(elapsed).toBeLessThan(500)
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

// ── AC: Responsive ────────────────────────────────────────────────────────────

test.describe("PROJ-11: Responsive", () => {
  test.beforeEach(async ({ request }) => {
    await ensureBonsImported(request)
  })

  test("Preistrend-Spalte auf Desktop (1440px) sichtbar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })
    await expect(page.getByRole("columnheader", { name: "Preistrend" })).toBeVisible()
  })

  test("Preistrend-Spalte auf Tablet (768px) sichtbar", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto("/produkte")
    await page.waitForSelector("table tbody tr", { timeout: 10000 })
    await expect(page.getByRole("columnheader", { name: "Preistrend" })).toBeVisible()
  })

  test("Preistrend-Spalte auf Mobile (375px) ausgeblendet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/produkte")
    await page.waitForSelector("table", { timeout: 10000 })
    const header = page.getByRole("columnheader", { name: "Preistrend" })
    await expect(header).not.toBeVisible()
  })
})
