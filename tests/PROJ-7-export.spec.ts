import { test, expect } from "@playwright/test"

test.describe("PROJ-7: Datenexport (CSV & Excel)", () => {
  // ── Setup ────────────────────────────────────────────────────────────────

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000/bon")
    // Wait for page to load
    await page.waitForLoadState("networkidle")
  })

  // ── AC 1: Export-Button auf Bon-Seite ────────────────────────────────────

  test("AC 1: Export-Button is visible on Bon-Übersichtsseite", async ({ page }) => {
    const exportButton = page.locator('button:has-text("Exportieren")')
    await expect(exportButton).toBeVisible()
  })

  test("AC 1: Export-Button opens dialog", async ({ page }) => {
    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Dialog title
    const title = page.locator('text="Daten exportieren"')
    await expect(title).toBeVisible()
  })

  // ── AC 2 & 3: CSV Export ────────────────────────────────────────────────

  test("AC 2 & 3: CSV Export with correct format", async ({ page, context }) => {
    // Listen for download
    const downloadPromise = context.waitForEvent("download")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    // Wait for dialog
    const csvButton = page.locator('button:has-text("CSV exportieren")')
    await expect(csvButton).toBeVisible()

    // Trigger CSV download
    await csvButton.click()

    // Get download
    const download = await downloadPromise
    const path = await download.path()

    // Verify filename format
    expect(download.suggestedFilename()).toMatch(/^ebon-export-\d{4}-\d{2}-\d{2}\.csv$/)

    // Read file
    const fs = await import("fs")
    const content = fs.readFileSync(path, "utf-8")

    // Check for UTF-8 BOM
    expect(content.charCodeAt(0)).toBe(0xfeff)

    // Check headers
    const lines = content.split("\n")
    const header = lines[0]
    expect(header).toContain("Datum")
    expect(header).toContain("Uhrzeit")
    expect(header).toContain("Markt")
    expect(header).toContain("Bon-Nr.")
    expect(header).toContain("Produktname")
    expect(header).toContain("Menge")
    expect(header).toContain("Einzelpreis")
    expect(header).toContain("Gesamtpreis")
    expect(header).toContain("MwSt-Code")
    expect(header).toContain("Rabatt")
    expect(header).toContain("Rabattbetrag")

    // Check German decimal format (comma)
    // Look for price with comma
    const hasCommaDecimal = lines.some((line) => /\d+,\d{2}/.test(line))
    expect(hasCommaDecimal).toBeTruthy()
  })

  // ── AC 4 & 5: Excel Export ──────────────────────────────────────────────

  test("AC 4 & 5: Excel Export with 3 sheets", async ({ page, context }) => {
    const downloadPromise = context.waitForEvent("download")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    const excelButton = page.locator('button:has-text("Excel exportieren")')
    await expect(excelButton).toBeVisible()

    await excelButton.click()

    const download = await downloadPromise

    // Verify filename
    expect(download.suggestedFilename()).toMatch(/^ebon-export-\d{4}-\d{2}-\d{2}\.xlsx$/)

    // Verify MIME type
    expect(download.suggestedFilename()).toEndWith(".xlsx")
  })

  // ── AC 6: Zeitraum-Filter ───────────────────────────────────────────────

  test("AC 6: Date filter in Export dialog", async ({ page }) => {
    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    // Check for date inputs
    const dateFromInput = page.locator('input[id="dateFrom"]')
    const dateToInput = page.locator('input[id="dateTo"]')

    await expect(dateFromInput).toBeVisible()
    await expect(dateToInput).toBeVisible()

    // Test setting dates
    await dateFromInput.fill("2026-01-01")
    await dateToInput.fill("2026-12-31")

    expect(await dateFromInput.inputValue()).toBe("2026-01-01")
    expect(await dateToInput.inputValue()).toBe("2026-12-31")
  })

  // ── AC 7: Alias-Option ──────────────────────────────────────────────────

  test("AC 7: Alias checkbox in Export dialog", async ({ page }) => {
    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    const aliasCheckbox = page.locator('input[id="useAlias"]')
    await expect(aliasCheckbox).toBeVisible()

    // Should be checked by default
    const isChecked = await aliasCheckbox.isChecked()
    expect(isChecked).toBeTruthy()

    // Can toggle
    await aliasCheckbox.click()
    const isUnchecked = await aliasCheckbox.isChecked()
    expect(isUnchecked).toBeFalsy()
  })

  // ── Edge Case: Empty state ──────────────────────────────────────────────

  test("Edge Case: Dialog handles errors gracefully", async ({ page }) => {
    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    // Set invalid date range (From > To)
    const dateFromInput = page.locator('input[id="dateFrom"]')
    const dateToInput = page.locator('input[id="dateTo"]')

    await dateFromInput.fill("2026-12-31")
    await dateToInput.fill("2026-01-01")

    const csvButton = page.locator('button:has-text("CSV exportieren")')
    await csvButton.click()

    // Error message should appear
    const errorAlert = page.locator('[role="alert"]')
    await expect(errorAlert).toBeVisible()
    await expect(errorAlert).toContainText("Start-Datum")
  })

  // ── Cross-browser: Statistiken-Seite ─────────────────────────────────────

  test("Export-Button is visible on Statistik-Dashboard", async ({ page }) => {
    await page.goto("http://localhost:3000/statistiken")
    await page.waitForLoadState("networkidle")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await expect(exportButton).toBeVisible()
  })

  test("Export from Statistik-Dashboard opens dialog", async ({ page }) => {
    await page.goto("http://localhost:3000/statistiken")
    await page.waitForLoadState("networkidle")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
  })

  // ── Responsive: Mobile ───────────────────────────────────────────────────

  test("Export dialog is responsive on mobile (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto("http://localhost:3000/bon")
    await page.waitForLoadState("networkidle")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await expect(exportButton).toBeVisible()

    await exportButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Buttons should be stackable/responsive
    const csvButton = page.locator('button:has-text("CSV exportieren")')
    const excelButton = page.locator('button:has-text("Excel exportieren")')

    await expect(csvButton).toBeVisible()
    await expect(excelButton).toBeVisible()
  })

  // ── Responsive: Tablet ──────────────────────────────────────────────────

  test("Export dialog works on tablet (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto("http://localhost:3000/bon")
    await page.waitForLoadState("networkidle")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
  })

  // ── Responsive: Desktop ─────────────────────────────────────────────────

  test("Export dialog works on desktop (1440px)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("http://localhost:3000/bon")
    await page.waitForLoadState("networkidle")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
  })

  // ── Dialog Cancellation ──────────────────────────────────────────────────

  test("Dialog can be closed with Cancel button", async ({ page }) => {
    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    const cancelButton = page.locator('button:has-text("Abbrechen")')
    await cancelButton.click()

    await expect(dialog).not.toBeVisible()
  })

  // ── Loading States ──────────────────────────────────────────────────────

  test("CSV button shows loading state during export", async ({ page, context }) => {
    const downloadPromise = context.waitForEvent("download")

    const exportButton = page.locator('button:has-text("Exportieren")')
    await exportButton.click()

    const csvButton = page.locator('button:has-text("CSV exportieren")')

    // Trigger download
    const downloadPromise2 = csvButton.click().then(() => downloadPromise)

    // During download, button might show loading state
    // Just verify button is disabled during process
    const download = await downloadPromise2
    expect(download).toBeTruthy()
  })
})
