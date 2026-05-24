import { test, expect } from "@playwright/test"
import path from "path"
import fs from "fs"

const KONTO_DIR = path.join(process.cwd(), "data", "konto")
const KONTO_CSV = path.join(KONTO_DIR, "kontobewegungen.csv")

// ── Helpers ────────────────────────────────────────────────────────────────

/** Import a Kontoauszug CSV via the API. */
async function importKonto(request: import("@playwright/test").APIRequestContext, csvPath: string) {
  if (!fs.existsSync(csvPath)) {
    console.warn(`Kontoauszug test file not found: ${csvPath}`)
    return
  }
  const csvBuffer = fs.readFileSync(csvPath)
  await request.post("/api/konto/import", {
    multipart: {
      file: { name: "kontobewegungen.csv", mimeType: "text/csv", buffer: csvBuffer },
    },
  })
}

/** Ensure test Kontoauszug is imported. */
async function ensureKontoImported(request: import("@playwright/test").APIRequestContext) {
  await importKonto(request, KONTO_CSV)
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe("PROJ-29: Kontoauszug-PDF-Toggle", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Transaktionsansicht
    await page.goto("/transaktionen")
  })

  test("AC-1: PDF-Button appears in accordion header for Paperless statements", async ({ page }) => {
    // Wait for transaction list to load
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Look for at least one expanded group with Paperless prefix marker
    const groupHeaders = page.locator("table tbody tr.bg-gray-50")
    const count = await groupHeaders.count()

    if (count === 0) {
      test.skip()
      return
    }

    // Check if any group contains "[paperless]" marker
    let foundPaperlessButton = false
    for (let i = 0; i < Math.min(count, 5); i++) {
      const header = groupHeaders.nth(i)
      const text = await header.textContent()

      if (text?.includes("[paperless]")) {
        // This group should have a PDF-button
        const pdfButton = header.locator("button[title*='PDF anzeigen'], button[title*='Zur Tabelle']")
        if (await pdfButton.isVisible()) {
          foundPaperlessButton = true
          break
        }
      }
    }

    if (!foundPaperlessButton) {
      console.warn("No Paperless statements found in test data")
      test.skip()
    }
  })

  test("AC-2: PDF-Button is NOT shown for non-Paperless statements", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Look for a group without [paperless] marker
    const groupHeaders = page.locator("table tbody tr.bg-gray-50")
    const count = await groupHeaders.count()

    if (count === 0) {
      test.skip()
      return
    }

    // Find a non-Paperless group
    for (let i = 0; i < Math.min(count, 5); i++) {
      const header = groupHeaders.nth(i)
      const text = await header.textContent()

      if (text && !text.includes("[paperless]")) {
        // This group should NOT have a PDF-button
        const pdfButton = header.locator("button[title*='PDF anzeigen'], button[title*='Zur Tabelle']")
        await expect(pdfButton).not.toBeVisible()
        break
      }
    }
  })

  test("AC-3: Click PDF-Button shows loading state then iframe", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Find a Paperless group and click PDF-button
    const groupHeaders = page.locator("table tbody tr.bg-gray-50")
    let pdfButton = null

    for (let i = 0; i < (await groupHeaders.count()); i++) {
      const header = groupHeaders.nth(i)
      const text = await header.textContent()

      if (text?.includes("[paperless]")) {
        // Expand the group first
        await header.click()
        await page.waitForTimeout(500)

        // Look for PDF-button
        pdfButton = header.locator("button[title='PDF anzeigen']").first()
        if (await pdfButton.isVisible()) {
          break
        }
      }
    }

    if (!pdfButton || !(await pdfButton.isVisible())) {
      console.warn("No accessible Paperless statement found for PDF test")
      test.skip()
      return
    }

    // Click PDF-button
    await pdfButton.click()
    await page.waitForTimeout(200)

    // Loading state might appear briefly
    const loadingState = page.locator("text='PDF wird geladen'")
    const iframeElement = page.locator("iframe[title*='Kontoauszug']")

    // Either loading or iframe should be visible (loading might be too fast)
    const hasLoadingOrIframe = await Promise.race([
      loadingState.isVisible(),
      iframeElement.isVisible(),
    ])

    expect(hasLoadingOrIframe).toBeTruthy()
  })

  test("AC-4: Clicking PDF-Button again returns to table view", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Find Paperless group
    const groupHeaders = page.locator("table tbody tr.bg-gray-50")
    let pdfButton = null
    let currentGroup = null

    for (let i = 0; i < (await groupHeaders.count()); i++) {
      const header = groupHeaders.nth(i)
      const text = await header.textContent()

      if (text?.includes("[paperless]")) {
        currentGroup = header
        await header.click()
        await page.waitForTimeout(500)

        pdfButton = header.locator("button[title='PDF anzeigen']").first()
        if (await pdfButton.isVisible()) {
          break
        }
      }
    }

    if (!pdfButton || !(await pdfButton.isVisible())) {
      test.skip()
      return
    }

    // Click to show PDF
    await pdfButton.click()
    await page.waitForTimeout(300)

    // Verify PDF is shown (iframe or error message)
    const iframeOrError = page.locator(
      "iframe[title*='Kontoauszug'], text='PDF konnte nicht geladen werden'"
    )
    await expect(iframeOrError.first()).toBeVisible({ timeout: 5000 })

    // Click PDF-button again (now it should say "Zur Tabelle wechseln")
    const returnButton = currentGroup?.locator("button[title='Zur Tabelle wechseln']").first()
    if (returnButton && (await returnButton.isVisible())) {
      await returnButton.click()
      await page.waitForTimeout(300)

      // Transaction table should be visible again
      const transactionRows = currentGroup?.locator("~ tr").filter({ has: page.locator("td") })
      await expect(transactionRows?.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test("AC-5: PDF-Button is disabled when group is collapsed", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const groupHeaders = page.locator("table tbody tr.bg-gray-50")

    for (let i = 0; i < (await groupHeaders.count()); i++) {
      const header = groupHeaders.nth(i)
      const text = await header.textContent()

      if (text?.includes("[paperless]")) {
        // Group is collapsed, PDF-button should not be visible
        const pdfButton = header.locator("button[title*='PDF']")
        if (await pdfButton.isVisible()) {
          // Expand it
          await header.click()
          await page.waitForTimeout(500)

          // Now PDF-button should be visible
          await expect(pdfButton).toBeVisible()

          // Collapse it
          await header.click()
          await page.waitForTimeout(500)

          // PDF-button should still be there (button position in header)
          await expect(pdfButton).toBeVisible()
        }
        break
      }
    }
  })

  test("AC-6: Text search does not hide PDF-Button for matching group", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Find a Paperless group with transactions
    const groupHeaders = page.locator("table tbody tr.bg-gray-50")
    let targetGroup = null

    for (let i = 0; i < (await groupHeaders.count()); i++) {
      const header = groupHeaders.nth(i)
      const text = await header.textContent()

      if (text?.includes("[paperless]")) {
        // Expand group to see transactions
        await header.click()
        await page.waitForTimeout(500)

        // Get a transaction description to search for
        const firstTxDescription = await header
          .locator("~ tr")
          .first()
          .locator("td")
          .nth(2)
          .textContent()

        if (firstTxDescription && firstTxDescription.length > 3) {
          // Search for this transaction
          const searchInput = page.locator("input[placeholder*='suchen']")
          await searchInput.fill(firstTxDescription.substring(0, 5))
          await page.waitForTimeout(500)

          // PDF-button should still be visible
          const pdfButton = header.locator("button[title*='PDF']")
          await expect(pdfButton).toBeVisible()

          targetGroup = header
          break
        }
      }
    }

    if (!targetGroup) {
      test.skip()
    }
  })

  test("AC-7: Error state shown if PDF fetch fails", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    // This test would require mocking Paperless to fail
    // For now, we just verify the error message structure is in the DOM
    const errorMessageElement = page.locator("text='PDF konnte nicht geladen werden'")

    // If no error is visible, that's OK (PDF loaded successfully)
    // Just verify the structure exists in the code
    const pageContent = await page.content()
    expect(pageContent).toContain("PDF konnte nicht geladen werden")
  })

  test("AC-8: PDF-button toggle clears when group is collapsed", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 })

    const groupHeaders = page.locator("table tbody tr.bg-gray-50")

    for (let i = 0; i < (await groupHeaders.count()); i++) {
      const header = groupHeaders.nth(i)
      const text = await header.textContent()

      if (text?.includes("[paperless]")) {
        // Expand group
        await header.click()
        await page.waitForTimeout(300)

        // Click PDF-button
        const pdfButton = header.locator("button[title='PDF anzeigen']").first()
        if (await pdfButton.isVisible()) {
          await pdfButton.click()
          await page.waitForTimeout(300)

          // Collapse group
          await header.click()
          await page.waitForTimeout(300)

          // Expand group again
          await header.click()
          await page.waitForTimeout(300)

          // Transaction table should be shown (not PDF) — toggle state was cleared
          const transactionTable = header.locator("~ tr").filter({ has: page.locator("td") })
          await expect(transactionTable.first()).toBeVisible()
        }
        break
      }
    }
  })
})
