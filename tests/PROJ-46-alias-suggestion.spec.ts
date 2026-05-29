import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import os from "os"

// A minimal valid-ish PDF payload that pdf-parse will reject gracefully
// (the API mock intercepts before parsing, so content doesn't matter for UI tests)
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n9\n%%EOF\n"
)

const TEMP_PDF = path.join(os.tmpdir(), "proj46-test-bon.pdf")

const MOCK_SUGGESTIONS_HIGH = [
  { raw_name: "BUTTER LANDLIEBE 250GR", suggestion: "Butter Landliebe 250g", confidence: 94 },
]

const MOCK_SUGGESTIONS_LOW = [
  { raw_name: "XYLOPHON EXTRAKT 500ML", suggestion: "Xylit Süßungsmittel", confidence: 32 },
]

const MOCK_SUGGESTIONS_NONE = [
  { raw_name: "QWERT ZUIOP 999G", suggestion: null, confidence: 0 },
]

test.beforeAll(() => {
  fs.writeFileSync(TEMP_PDF, MINIMAL_PDF)
})

test.afterAll(() => {
  if (fs.existsSync(TEMP_PDF)) fs.unlinkSync(TEMP_PDF)
})

/** Mock the /api/import endpoint and upload the temp PDF via the file input. */
async function importWithSuggestions(
  page: import("@playwright/test").Page,
  suggestions: typeof MOCK_SUGGESTIONS_HIGH | typeof MOCK_SUGGESTIONS_LOW | typeof MOCK_SUGGESTIONS_NONE
) {
  await page.route("**/api/import", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 9999,
        date: "01.01.2026",
        store: "REWE Testmarkt",
        items: 5,
        total: "12,34",
        alias_suggestions: suggestions,
      }),
    })
  })

  // eBon input is the 3rd file input (Bestellung=0, AVIS=1, eBon=2, Kontoauszug=3)
  const fileInput = page.locator('input[type="file"]').nth(2)
  await fileInput.setInputFiles(TEMP_PDF)
}

// ── AC1: Dialog appears for new raw_names after import ─────────────────────

test.describe("PROJ-46: Alias Suggestion Dialog", () => {
  test("AC1: Dialog opens with suggestions after eBon import", async ({ page }) => {
    await page.goto("/import")
    await importWithSuggestions(page, MOCK_SUGGESTIONS_HIGH)

    // Dialog should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Alias-Vorschläge/)).toBeVisible()
    await expect(page.getByText("BUTTER LANDLIEBE 250GR")).toBeVisible()
    await expect(page.getByText(/→ Butter Landliebe 250g/)).toBeVisible()
  })

  // ── AC2: Übernehmen saves with source='suggested' ─────────────────────────

  test("AC2: Übernehmen button saves alias with source=suggested", async ({ page }) => {
    await page.goto("/import")

    let capturedBody: Record<string, unknown> | null = null
    await page.route("**/api/produkte/*/alias", async (route) => {
      const body = route.request().postDataJSON()
      capturedBody = body
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    })

    await importWithSuggestions(page, MOCK_SUGGESTIONS_HIGH)
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })

    await page.getByRole("button", { name: /Übernehmen/ }).first().click()

    // Verify the PUT body contains source='suggested'
    await expect(async () => {
      expect(capturedBody).not.toBeNull()
      expect(capturedBody!.source).toBe("suggested")
      expect(capturedBody!.alias).toBe("Butter Landliebe 250g")
    }).toPass({ timeout: 5000 })

    // Row should be marked as saved
    await expect(page.getByText("Gespeichert")).toBeVisible()
  })

  // ── AC3: Anderer Alias saves with source='manual' ─────────────────────────

  test("AC3: Anderer Alias saves custom alias with source=manual", async ({ page }) => {
    await page.goto("/import")

    let capturedBody: Record<string, unknown> | null = null
    await page.route("**/api/produkte/*/alias", async (route) => {
      const body = route.request().postDataJSON()
      capturedBody = body
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    })

    await importWithSuggestions(page, MOCK_SUGGESTIONS_HIGH)
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })

    await page.getByRole("button", { name: /Anderer Alias/ }).first().click()
    await expect(page.getByPlaceholder(/Produktname eingeben/)).toBeVisible()
    await page.getByPlaceholder(/Produktname eingeben/).fill("Mein eigener Alias")
    await page.getByRole("button", { name: "Speichern" }).click()

    await expect(async () => {
      expect(capturedBody!.source).toBe("manual")
      expect(capturedBody!.alias).toBe("Mein eigener Alias")
    }).toPass({ timeout: 5000 })
  })

  // ── AC4: Überspringen skips without saving ────────────────────────────────

  test("AC4: Überspringen closes row without setting an alias", async ({ page }) => {
    await page.goto("/import")

    let aliasCalled = false
    await page.route("**/api/produkte/*/alias", async (route) => {
      aliasCalled = true
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    })

    await importWithSuggestions(page, MOCK_SUGGESTIONS_HIGH)
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })

    await page.getByRole("button", { name: /Überspringen/ }).first().click()

    // Row should show "Übersprungen" and no alias API call should have been made
    await expect(page.getByText("Übersprungen")).toBeVisible()
    expect(aliasCalled).toBe(false)
  })

  // ── AC5: confidence < 50% shows "niedrige Konfidenz" badge ───────────────

  test("AC5: Low confidence suggestion shows niedrige Konfidenz badge", async ({ page }) => {
    await page.goto("/import")
    await importWithSuggestions(page, MOCK_SUGGESTIONS_LOW)

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/niedrige Konfidenz/i)).toBeVisible()
  })

  // ── Edge: No suggestion → manual input shown ─────────────────────────────

  test("Edge: No suggestion for raw_name shows manual input option", async ({ page }) => {
    await page.goto("/import")
    await importWithSuggestions(page, MOCK_SUGGESTIONS_NONE)

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Kein Vorschlag/)).toBeVisible()
    await expect(page.getByRole("button", { name: /Alias eingeben/ })).toBeVisible()
  })

  // ── Edge: High confidence (≥90%) row is visually highlighted ─────────────

  test("Edge: High confidence suggestion (≥90%) row is green highlighted", async ({ page }) => {
    await page.goto("/import")
    await importWithSuggestions(page, MOCK_SUGGESTIONS_HIGH)

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 })
    // Green border class on the row
    const row = page.locator(".border-green-200").first()
    await expect(row).toBeVisible()
  })

  // ── Edge: Dialog does not appear when no suggestions returned ─────────────

  test("Edge: No dialog appears when import has no unmapped raw_names", async ({ page }) => {
    await page.goto("/import")

    await page.route("**/api/import", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 9999,
          date: "01.01.2026",
          store: "REWE",
          items: 3,
          total: "9,99",
          alias_suggestions: [],
        }),
      })
    })

    const fileInput = page.locator('input[type="file"]').nth(2)
    await fileInput.setInputFiles(TEMP_PDF)

    // Wait for import success badge
    await expect(page.getByText("Importiert")).toBeVisible({ timeout: 10000 })

    // Dialog should NOT appear
    await expect(page.getByRole("dialog")).not.toBeVisible()
  })
})
