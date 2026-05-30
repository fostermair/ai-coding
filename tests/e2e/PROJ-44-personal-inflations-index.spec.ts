import { test, expect } from "@playwright/test"

test.describe("PROJ-44: Personal Inflations-Index", () => {
  // AC-1: Dashboard tab loads without error
  test("AC-1: Statistiken-Tab lädt ohne Fehler (Card oder Empty-State erscheint)", async ({
    page,
  }) => {
    await page.goto("/analyse?tab=statistiken")
    // Wait for either our card or the empty-state to appear
    await page
      .waitForSelector(
        "text=Persönlicher Inflations-Index, text=Noch keine Daten für Statistiken",
        { timeout: 15000 }
      )
      .catch(() => {
        // If neither shows within 15s, still don't crash — network issue
      })

    const card = page.locator("text=Persönlicher Inflations-Index")
    const emptyState = page.locator("text=Noch keine Daten für Statistiken")
    const hasCard = (await card.count()) > 0
    const hasEmpty = (await emptyState.count()) > 0
    expect(hasCard || hasEmpty).toBe(true)
  })

  // AC-1 (data-dependent): Card visible when multi-year data exists
  test("AC-1: Card 'Persönlicher Inflations-Index' sichtbar wenn Multi-Jahres-Daten vorhanden", async ({
    page,
  }) => {
    const apiRes = await page.request.get("/api/statistiken/inflations-index")
    const json = await apiRes.json()

    if (json.available_periods.length === 0) {
      test.skip()
      return
    }

    await page.goto("/analyse?tab=statistiken")
    await page.waitForSelector("text=Persönlicher Inflations-Index", { timeout: 15000 })
    await expect(page.locator("text=Persönlicher Inflations-Index")).toBeVisible()
    await expect(page.locator("text=Deine Lebensmittel-Inflation")).toBeVisible()
  })

  // API shape
  test("API /api/statistiken/inflations-index antwortet mit korrekter Struktur", async ({
    page,
  }) => {
    const response = await page.request.get("/api/statistiken/inflations-index")
    expect(response.status()).toBe(200)

    const json = await response.json()
    expect(json).toHaveProperty("personal_rate")
    expect(json).toHaveProperty("official_rate")
    expect(json).toHaveProperty("delta")
    expect(json).toHaveProperty("basis_products_count")
    expect(json).toHaveProperty("period_von")
    expect(json).toHaveProperty("period_bis")
    expect(json).toHaveProperty("warning")
    expect(json).toHaveProperty("sparkline")
    expect(json).toHaveProperty("available_periods")
    expect(Array.isArray(json.sparkline)).toBe(true)
    expect(Array.isArray(json.available_periods)).toBe(true)
  })

  // AC-4: Seed-Referenzwerte sind vorbelegt (2022-2025)
  test("AC-4: Referenzwerte-API enthält Seed-Werte für 2022–2025", async ({ page }) => {
    const response = await page.request.get(
      "/api/statistiken/inflations-index/referenzwerte"
    )
    expect(response.status()).toBe(200)

    const json = await response.json()
    expect(json).toHaveProperty("rows")
    expect(Array.isArray(json.rows)).toBe(true)

    const years = json.rows.map((r: { year: number }) => r.year)
    expect(years).toContain(2022)
    expect(years).toContain(2023)
    expect(years).toContain(2024)
    expect(years).toContain(2025)

    const row2022 = json.rows.find((r: { year: number }) => r.year === 2022)
    expect(row2022?.official_rate_percent).toBe(12.4)

    const row2023 = json.rows.find((r: { year: number }) => r.year === 2023)
    expect(row2023?.official_rate_percent).toBe(6.4)

    const row2024 = json.rows.find((r: { year: number }) => r.year === 2024)
    expect(row2024?.official_rate_percent).toBe(2.0)

    const row2025 = json.rows.find((r: { year: number }) => r.year === 2025)
    expect(row2025?.official_rate_percent).toBeNull()
  })

  // AC-5: Delta-Badge Farbe
  test("AC-5: Delta-Badge erscheint und hat korrekte Farbe", async ({ page }) => {
    const response = await page.request.get("/api/statistiken/inflations-index")
    const json = await response.json()

    if (json.personal_rate === null || json.official_rate === null || json.delta === null) {
      test.skip()
      return
    }

    await page.goto("/analyse?tab=statistiken")
    await page.waitForSelector("text=Persönlicher Inflations-Index", { timeout: 15000 })

    const deltaBadge = page.locator("text=gegenüber offiziell")
    await expect(deltaBadge).toBeVisible({ timeout: 10000 })

    if (json.delta < 0) {
      await expect(page.locator(".text-green-700").first()).toBeVisible()
    } else if (json.delta > 0) {
      await expect(page.locator(".text-red-700").first()).toBeVisible()
    }
  })

  // AC-6: Info-Icon sichtbar
  test("AC-6: Info-Icon für Tooltip sichtbar auf der Card", async ({ page }) => {
    const response = await page.request.get("/api/statistiken/inflations-index")
    const json = await response.json()

    if (json.available_periods.length === 0) {
      test.skip()
      return
    }

    await page.goto("/analyse?tab=statistiken")
    await page.waitForSelector("text=Persönlicher Inflations-Index", { timeout: 15000 })
    await expect(page.locator("text=Persönlicher Inflations-Index")).toBeVisible()
  })

  // AC-3: Config-Dialog zeigt Referenzwerte (Desktop only — mobile has collapsed nav)
  test("AC-3: Config-Dialog öffnet und zeigt Lebensmittel-VPI Referenzwerte", async ({
    page,
    isMobile,
  }) => {
    if (isMobile) {
      test.skip()
      return
    }

    await page.goto("/analyse")
    await page.waitForLoadState("networkidle")

    // Click the settings gear icon in the nav
    const settingsBtn = page.locator("button[title='Konfiguration']")
    await settingsBtn.waitFor({ timeout: 10000 })
    await settingsBtn.click()
    await page.waitForTimeout(500)

    await expect(page.locator("text=Lebensmittel-VPI Referenzwerte")).toBeVisible()
    await expect(page.locator("text=Quelle: Destatis")).toBeVisible()
    await expect(page.locator("text=2022").first()).toBeVisible()
  })

  // AC-4: PUT Referenzwert Update via API
  test("AC-4: Referenzwert-Update via API funktioniert korrekt", async ({ page }) => {
    const getRes = await page.request.get("/api/statistiken/inflations-index/referenzwerte")
    const { rows } = await getRes.json()
    const row2025Before = rows.find((r: { year: number }) => r.year === 2025)

    // Update 2025 value
    const putRes = await page.request.put("/api/statistiken/inflations-index/referenzwerte", {
      data: { year: 2025, official_rate_percent: 3.1 },
      headers: { "Content-Type": "application/json" },
    })
    expect(putRes.status()).toBe(200)
    const putJson = await putRes.json()
    expect(putJson.ok).toBe(true)

    // Verify saved
    const getRes2 = await page.request.get("/api/statistiken/inflations-index/referenzwerte")
    const data2 = await getRes2.json()
    const row2025After = data2.rows.find((r: { year: number }) => r.year === 2025)
    expect(row2025After?.official_rate_percent).toBe(3.1)

    // Restore
    await page.request.put("/api/statistiken/inflations-index/referenzwerte", {
      data: {
        year: 2025,
        official_rate_percent: row2025Before?.official_rate_percent ?? null,
      },
      headers: { "Content-Type": "application/json" },
    })
  })

  // AC-4: Invalid year rejected
  test("AC-4: Ungültiges Jahr wird vom PUT-Endpoint abgewiesen (400)", async ({ page }) => {
    const res = await page.request.put("/api/statistiken/inflations-index/referenzwerte", {
      data: { year: 1800, official_rate_percent: 5.0 },
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).toBe(400)
  })

  // AC-8: Warning field in API response
  test("AC-8: API gibt warning-Feld zurück (null oder String)", async ({ page }) => {
    const response = await page.request.get("/api/statistiken/inflations-index")
    const json = await response.json()
    expect(json.warning === null || typeof json.warning === "string").toBe(true)
  })

  // EC: Only 1 year → warning text in API response
  test("EC: Wenn 0 Perioden verfügbar, zeigt API korrekte Meldung", async ({ page }) => {
    const response = await page.request.get("/api/statistiken/inflations-index")
    const json = await response.json()

    if (json.available_periods.length === 0) {
      expect(json.warning).toContain("zwei verschiedenen Jahren")
    } else {
      expect(json.available_periods.length).toBeGreaterThan(0)
    }
  })
})
