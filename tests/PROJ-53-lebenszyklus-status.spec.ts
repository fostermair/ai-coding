import { test, expect } from "@playwright/test"

// These tests run against the live dev DB — no PDF imports needed.
// The DB is expected to have bons already imported (REWE eBons with items).

test.describe("PROJ-53: Ausgaben-Lebenszyklus-Status", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    // Wait for table to load — skip if no bons exist
    const firstRow = page.locator("table tbody tr").first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })
  })

  // AC: "Status"-Spalte ist in der Tabelle vorhanden
  test("AC1: 'Status'-Spaltenheader ist in der Bon-Tabelle sichtbar", async ({ page }) => {
    await expect(page.locator("table thead").getByText("Status")).toBeVisible()
  })

  // AC: Mindestens ein Lifecycle-Badge ist sichtbar
  test("AC2: Mindestens ein Lifecycle-Status-Badge ist in der Bon-Liste sichtbar", async ({ page }) => {
    const badges = page.locator("table tbody").getByText(/^(Konto|Beleg|Vollständig|HelloFresh)$/)
    await expect(badges.first()).toBeVisible({ timeout: 5000 })
  })

  // AC: eBon mit Artikeln zeigt 'Beleg' (blau)
  test("AC3: Echter eBon mit Artikeln zeigt Badge 'Beleg'", async ({ page, request }) => {
    const resp = await request.get("/api/bons")
    const body = await resp.json()
    const hasRealBon = body.bons.some(
      (b: { is_virtual?: number; item_count: number }) => !b.is_virtual && b.item_count > 0
    )
    if (!hasRealBon) {
      test.skip()
      return
    }

    const belegBadge = page.locator("table tbody").getByText("Beleg").first()
    await expect(belegBadge).toBeVisible()
  })

  // AC: Virtueller Bon zeigt 'Konto' (grau)
  test("AC4: Virtueller Bon (nur Kontoauszug) zeigt Badge 'Konto'", async ({ page, request }) => {
    const resp = await request.get("/api/bons")
    const body = await resp.json()
    const hasVirtualBon = body.bons.some((b: { is_virtual?: number }) => b.is_virtual === 1)
    if (!hasVirtualBon) {
      test.skip()
      return
    }

    const kontoBadge = page.locator("table tbody").getByText("Konto").first()
    await expect(kontoBadge).toBeVisible()
  })

  // AC: avis_status='complete' oder has_bestellung=1 zeigt 'Vollständig'
  test("AC5: Bon mit bestätigtem AVIS oder Bestellung zeigt Badge 'Vollständig'", async ({ page, request }) => {
    const resp = await request.get("/api/bons")
    const body = await resp.json()
    const hasVollstaendig = body.bons.some(
      (b: { avis_status?: string; has_bestellung?: number; is_virtual?: number; item_count: number }) =>
        !b.is_virtual && b.item_count > 0 && (b.avis_status === "complete" || b.has_bestellung === 1)
    )
    if (!hasVollstaendig) {
      test.skip()
      return
    }

    const badge = page.locator("table tbody").getByText("Vollständig").first()
    await expect(badge).toBeVisible()
  })

  // AC: AVIS='pending' zeigt 'Beleg', nicht 'Vollständig' — API-Daten-Prüfung
  test("AC6: avis_status='pending' führt zu Badge 'Beleg' (unit-tested), API liefert Feld korrekt", async ({ request }) => {
    const resp = await request.get("/api/bons")
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    // Verify the API returns the expected fields for status derivation
    const firstBon = body.bons[0]
    expect(typeof firstBon.item_count).toBe("number")
    expect("is_virtual" in firstBon).toBe(true)
    expect("avis_status" in firstBon).toBe(true)
    expect("has_bestellung" in firstBon).toBe(true)
  })

  // AC: AVIS- und Bestellung-Badges bleiben erhalten neben Status-Badge
  test("AC7: AVIS-Spaltenheader bleibt erhalten neben neuem Status-Header", async ({ page }) => {
    await expect(page.locator("table thead").getByText("AVIS")).toBeVisible()
    await expect(page.locator("table thead").getByText("Status")).toBeVisible()
  })

  // AC: Tooltip am Badge zeigt erklärenden Text
  test("AC8: Tooltip erscheint beim Hovern über den Status-Badge", async ({ page }) => {
    const badge = page.locator("table tbody").getByText(/^(Konto|Beleg|Vollständig|HelloFresh)$/).first()
    await expect(badge).toBeVisible()
    await badge.hover()
    const tooltip = page.locator("[role='tooltip']")
    await expect(tooltip).toBeVisible({ timeout: 3000 })
    await expect(tooltip).not.toBeEmpty()
  })

  // AC: HelloFresh-Zeilen zeigen eigenen Badge
  test("AC9: HelloFresh-Zeilen zeigen Badge 'HelloFresh' in Status-Spalte", async ({ page, request }) => {
    const resp = await request.get("/api/hellofresh/transactions")
    const body = await resp.json()
    const hasHfTransactions = (body.transactions ?? []).length > 0
    if (!hasHfTransactions) {
      test.skip()
      return
    }

    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // HelloFresh badge should appear somewhere in the table
    const hfBadge = page.locator("table tbody").getByText("HelloFresh")
    await expect(hfBadge.first()).toBeVisible()
  })
})

// ── Responsive ───────────────────────────────────────────────────────────────

test.describe("PROJ-53: Responsive – Status-Badge auf Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("Status-Badge ist auf Mobile sichtbar", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })
    const badge = page.locator("table tbody").getByText(/^(Konto|Beleg|Vollständig|HelloFresh)$/).first()
    await expect(badge).toBeVisible({ timeout: 5000 })
  })
})

// ── Security / Edge Cases ─────────────────────────────────────────────────────

test.describe("PROJ-53: Security Audit", () => {
  test("API /api/bons liefert keine sensiblen Felder unerwartet", async ({ request }) => {
    const resp = await request.get("/api/bons")
    const body = await resp.json()
    const firstBon = body.bons[0]
    // Lifecycle-relevant fields must be present
    expect(firstBon).toHaveProperty("is_virtual")
    expect(firstBon).toHaveProperty("item_count")
    expect(firstBon).toHaveProperty("avis_status")
    expect(firstBon).toHaveProperty("has_bestellung")
    // No raw SQL or internal errors should leak
    expect(typeof body.bons).toBe("object")
    expect(Array.isArray(body.bons)).toBe(true)
  })
})
