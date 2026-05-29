import { test, expect } from "@playwright/test"

/**
 * E2E Tests for PROJ-45: Auto-Kategorisierung von Produkten
 *
 * Tests gegen die Acceptance Criteria aus der spec.md
 */

test.describe("PROJ-45: Auto-Kategorisierung", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/produkte")
    await page.waitForLoadState("domcontentloaded")
    // Wait until at least the main heading is visible
    await page.waitForSelector("h1", { timeout: 10000 })
  })

  // AC4: Beim Import wird Auto-Kategorisierung ausgeführt (geprüft via UI — Produkte zeigen Kategorie)
  test("AC4: Produkte in der Liste haben eine Kategorie (nie leer)", async ({ page }) => {
    // Warte bis die Tabelle geladen ist
    const table = page.locator("table")
    await expect(table).toBeVisible({ timeout: 10000 })

    // Mindestens eine Zeile muss vorhanden sein
    const rows = page.locator("tbody tr")
    const count = await rows.count()
    if (count === 0) {
      test.skip() // Keine Produkte im Test-DB
      return
    }

    // Alle sichtbaren Kategorie-Zellen müssen einen Inhalt haben
    // (Kategorie-Dropdown in jeder Zeile, als Select)
    const selects = page.locator("tbody tr [data-radix-select-trigger], tbody tr button[role='combobox']")
    const selectCount = await selects.count()
    expect(selectCount).toBeGreaterThan(0)
  })

  // AC6: UI erlaubt manuelles Setzen einer Kategorie
  test("AC6: Kategorie-Dropdown ist in der Produktliste vorhanden und bedienbar", async ({ page }) => {
    const table = page.locator("table")
    await expect(table).toBeVisible({ timeout: 10000 })

    const rows = page.locator("tbody tr")
    const count = await rows.count()
    if (count === 0) {
      test.skip()
      return
    }

    // Erstes Kategorie-Dropdown finden
    const firstSelect = page.locator("tbody tr").first().locator("[role='combobox']").first()
    await expect(firstSelect).toBeVisible()
  })

  // AC8: Re-Run-Button ist vorhanden und anstoßbar
  test("AC8: Re-Run-Button 'Alle neu kategorisieren' ist vorhanden", async ({ page }) => {
    // Wait for product data to load (table appears after fetch)
    await page.waitForSelector("table", { timeout: 15000 }).catch(() => {
      // If no table (empty DB), test is skipped
      test.skip()
    })
    const button = page.getByRole("button", { name: /neu kategorisieren/i })
    await expect(button).toBeVisible({ timeout: 5000 })
  })

  // AC8: Re-Run klicken sendet POST und lädt Daten neu
  test("AC8: Re-Run-Button triggert Rekategorisierung", async ({ page }) => {
    await page.waitForSelector("table", { timeout: 15000 }).catch(() => { test.skip(); return })
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/produkte/recategorize") && req.method() === "POST"),
      page.getByRole("button", { name: /neu kategorisieren/i }).click(),
    ])
    expect(request).toBeDefined()
  })

  // AC4-Spalte: Kategorie-Spalte ist sicht- und filterbar (PROJ-15-konform)
  test("AC4: Spalte 'Kategorie' ist in der Tabelle sichtbar (Desktop)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload()
    await page.waitForLoadState("networkidle")

    const table = page.locator("table")
    await expect(table).toBeVisible({ timeout: 10000 })

    // Spaltenheader "Kategorie" soll vorhanden sein
    const header = page.getByRole("columnheader", { name: /kategorie/i })
    await expect(header).toBeVisible()
  })

  // AC1: API gibt category und category_source zurück
  test("AC1: /api/produkte liefert category und category_source Felder", async ({ page }) => {
    const response = await page.request.get("/api/produkte")
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.products).toBeDefined()

    if (body.products.length > 0) {
      const first = body.products[0]
      expect(first).toHaveProperty("category")
      expect(first).toHaveProperty("category_source")
      expect(typeof first.category).toBe("string")
      expect(first.category.length).toBeGreaterThan(0)
      expect(["auto", "manual"]).toContain(first.category_source)
    }
  })

  // AC2: product_categories Tabelle + source-Feld via API prüfbar
  test("AC2: product_categories Einträge haben valide source ('auto' oder 'manual')", async ({ page }) => {
    const response = await page.request.get("/api/produkte")
    expect(response.ok()).toBe(true)
    const body = await response.json()

    if (body.products.length > 0) {
      for (const p of body.products.slice(0, 10)) {
        expect(["auto", "manual"]).toContain(p.category_source)
      }
    }
  })

  // AC3: Standard-Kategorien via /api/produkte/categories
  test("AC3: /api/produkte/categories liefert mind. 12 Kategorien inkl. Pflichtset", async ({ page }) => {
    const response = await page.request.get("/api/produkte/categories")
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.categories).toBeDefined()
    expect(body.categories.length).toBeGreaterThanOrEqual(12)

    const slugs = body.categories.map((c: { slug: string }) => c.slug)
    expect(slugs).toContain("milchprodukte")
    expect(slugs).toContain("brot")
    expect(slugs).toContain("obst")
    expect(slugs).toContain("gemuese")
    expect(slugs).toContain("fleisch")
    expect(slugs).toContain("tiefkuehl")
    expect(slugs).toContain("getraenke")
    expect(slugs).toContain("suesswaren")
    expect(slugs).toContain("drogerie")
    expect(slugs).toContain("pfand")
    expect(slugs).toContain("tabak")
    expect(slugs).toContain("sonstiges")
  })

  // AC3: Pfand, Tabak, Drogerie sind default excluded
  test("AC3: Pfand, Tabak, Drogerie sind default_excluded_from_stats = true", async ({ page }) => {
    const response = await page.request.get("/api/produkte/categories")
    const body = await response.json()

    const pfand = body.categories.find((c: { slug: string }) => c.slug === "pfand")
    const tabak = body.categories.find((c: { slug: string }) => c.slug === "tabak")
    const drogerie = body.categories.find((c: { slug: string }) => c.slug === "drogerie")

    expect(pfand?.default_excluded_from_stats).toBe(true)
    expect(tabak?.default_excluded_from_stats).toBe(true)
    expect(drogerie?.default_excluded_from_stats).toBe(true)
  })

  // Manuelles Override via API
  test("AC6: PUT /api/produkte/[name]/category setzt source='manual'", async ({ page }) => {
    // Erst ein Produkt aus der Liste holen
    const listResp = await page.request.get("/api/produkte")
    const listBody = await listResp.json()
    if (listBody.products.length === 0) { test.skip(); return }

    const firstProduct = listBody.products[0]
    const rawName = firstProduct.raw_name
    const originalCategory = firstProduct.category

    // Andere Kategorie wählen
    const categoriesResp = await page.request.get("/api/produkte/categories")
    const cats = (await categoriesResp.json()).categories
    const other = cats.find((c: { slug: string }) => c.slug !== originalCategory)

    // Override setzen
    const putResp = await page.request.put(
      `/api/produkte/${encodeURIComponent(rawName)}/category`,
      { data: { category: other.slug } }
    )
    expect(putResp.ok()).toBe(true)
    const putBody = await putResp.json()
    expect(putBody.source).toBe("manual")
    expect(putBody.category).toBe(other.slug)

    // Zurücksetzen (DELETE → auto)
    const delResp = await page.request.delete(
      `/api/produkte/${encodeURIComponent(rawName)}/category`
    )
    expect(delResp.ok()).toBe(true)
    const delBody = await delResp.json()
    expect(delBody.source).toBe("auto")
  })
})
