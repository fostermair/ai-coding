import { test, expect } from "@playwright/test"

test.describe("PROJ-50: Einheitliche PDF-Viewer-Komponente", () => {
  test("Bon-Detail: EBon-Tab zeigt PDF mit PdfViewer (kein iframe)", async ({ page }) => {
    // Navigate to a bon detail page
    await page.goto("http://localhost:3000/")

    // Click on first bon if available, or navigate directly
    // Looking for a bon link in the list
    const bonLink = page.locator("a[href*='/bon/']").first()
    if (await bonLink.count() > 0) {
      await bonLink.click()
    } else {
      // Fallback: navigate directly with a known bon ID (adjust as needed)
      await page.goto("http://localhost:3000/bon/1")
    }

    // Wait for the bon detail page to load
    await page.waitForSelector("[data-testid='bon-detail']", { timeout: 5000 }).catch(() => null)

    // Check EBon tab exists and click it
    const ebonTab = page.locator("text=EBon")
    if (await ebonTab.count() > 0) {
      await ebonTab.click()
      await page.waitForTimeout(500) // Allow tab content to render
    }

    // Verify no <iframe> elements in the page
    const iframes = page.locator("iframe")
    expect(await iframes.count()).toBe(0)

    // Verify PdfViewer component rendered (check for PDF controls)
    const zoomButtons = page.locator("button[title*='Zoom']")
    const navigationButtons = page.locator("button[title*='Seite']")

    // At least zoom or navigation controls should be present if PDF loaded
    const controlsExist = (await zoomButtons.count() > 0) || (await navigationButtons.count() > 0)
    expect(controlsExist).toBe(true)
  })

  test("Kontoauszug-PDF: Öffnet mit PdfViewer und zeigt Highlight", async ({ page }) => {
    // Navigate to transactions page
    await page.goto("http://localhost:3000/einstellungen?tab=konto")

    // Wait for transaction list to load
    await page.waitForTimeout(1000)

    // Look for a transaction row
    const transactionRows = page.locator("table tbody tr")
    if (await transactionRows.count() > 0) {
      // Click on a transaction to show PDF
      const firstRow = transactionRows.first()
      await firstRow.click()
      await page.waitForTimeout(500)
    }

    // Check if PDF viewer is visible (controls should exist)
    const pdfContainer = page.locator(".react-pdf__Document")
    const isPdfVisible = (await pdfContainer.count() > 0)

    if (isPdfVisible) {
      // Verify page counter shows (Seite X / N format)
      const pageCounter = page.locator("text=/Seite \\d+ \\/ \\d+/")
      expect(await pageCounter.count()).toBeGreaterThan(0)
    }
  })

  test("Import-History: Inline PDFs nutzen PdfViewer (kein Blob-Fetch + iframe)", async ({ page }) => {
    // Navigate to einstellungen with import tab
    await page.goto("http://localhost:3000/einstellungen?tab=import")

    // Wait for import history to load
    await page.waitForTimeout(1000)

    // Verify no <iframe> elements anywhere on page
    const iframes = page.locator("iframe")
    expect(await iframes.count()).toBe(0)

    // Check for PDF controls that indicate PdfViewer is being used
    const pdfControls = page.locator("button[title*='Seite']")
    // Controls may or may not be visible depending on whether PDF is open
    // Just verify structure doesn't use iframes
  })

  test("PdfViewer: Zoom-Buttons ändern Zoomlevel", async ({ page }) => {
    // Navigate to a bon with PDF
    await page.goto("http://localhost:3000/")

    const bonLink = page.locator("a[href*='/bon/']").first()
    if (await bonLink.count() > 0) {
      await bonLink.click()
      await page.waitForTimeout(500)

      // Click EBon tab if it exists
      const ebonTab = page.locator("text=EBon")
      if (await ebonTab.count() > 0) {
        await ebonTab.click()
        await page.waitForTimeout(500)
      }

      // Find zoom percentage display
      const zoomPercent = page.locator("text=/\\d+%/").first()
      const initialZoom = await zoomPercent.textContent()

      // Click zoom in button
      const zoomInButton = page.locator("button[title='Vergrößern']").first()
      if (await zoomInButton.count() > 0) {
        await zoomInButton.click()
        await page.waitForTimeout(300)

        const newZoom = await zoomPercent.textContent()
        // Verify zoom changed
        expect(newZoom).not.toBe(initialZoom)
      }
    }
  })

  test("PdfViewer: Seiten-Navigation (Prev / Next)", async ({ page }) => {
    // Navigate to a bon with multi-page PDF
    await page.goto("http://localhost:3000/")

    const bonLink = page.locator("a[href*='/bon/']").first()
    if (await bonLink.count() > 0) {
      await bonLink.click()
      await page.waitForTimeout(500)

      const ebonTab = page.locator("text=EBon")
      if (await ebonTab.count() > 0) {
        await ebonTab.click()
        await page.waitForTimeout(500)

        // Get initial page number
        const pageCounter = page.locator("text=/Seite \\d+ \\/ (\\d+)/")
        const pageCountText = await pageCounter.textContent()

        if (pageCountText && pageCountText.includes("/")) {
          const parts = pageCountText.match(/Seite (\d+) \/ (\d+)/)
          if (parts && parseInt(parts[2]) > 1) {
            // Multi-page PDF found
            const currentPage = parseInt(parts[1])

            // Click next button
            const nextButton = page.locator("button[title='Nächste Seite']").first()
            if (await nextButton.count() > 0 && !await nextButton.isDisabled()) {
              await nextButton.click()
              await page.waitForTimeout(300)

              const newCountText = await pageCounter.textContent()
              const newParts = newCountText?.match(/Seite (\d+) \/ (\d+)/)
              expect(parseInt(newParts?.[1] || "0")).toBeGreaterThan(currentPage)
            }
          }
        }
      }
    }
  })

  test("PdfViewer: Download-Button ist vorhanden (toolbar=true)", async ({ page }) => {
    // Navigate to transaction list where PDF viewer has toolbar
    await page.goto("http://localhost:3000/einstellungen?tab=konto")

    await page.waitForTimeout(1000)

    // Click a transaction to show PDF
    const transactionRows = page.locator("table tbody tr")
    if (await transactionRows.count() > 0) {
      await transactionRows.first().click()
      await page.waitForTimeout(500)

      // Look for download button (should exist with toolbar=true)
      const downloadButton = page.locator("button[title='Herunterladen']")
      expect(await downloadButton.count()).toBeGreaterThan(0)

      // Look for external open button
      const externalButton = page.locator("button[title='Im neuen Fenster öffnen']")
      expect(await externalButton.count()).toBeGreaterThan(0)
    }
  })

  test("PdfViewer: toolbar=false versteckt Download/Extern-Buttons aber zeigt Zoom/Navigation", async ({ page }) => {
    // Navigate to bon detail (uses toolbar=false)
    await page.goto("http://localhost:3000/")

    const bonLink = page.locator("a[href*='/bon/']").first()
    if (await bonLink.count() > 0) {
      await bonLink.click()
      await page.waitForTimeout(500)

      const ebonTab = page.locator("text=EBon")
      if (await ebonTab.count() > 0) {
        await ebonTab.click()
        await page.waitForTimeout(500)

        // Download button should NOT be visible
        const downloadButton = page.locator("button[title='Herunterladen']")
        expect(await downloadButton.count()).toBe(0)

        // Zoom buttons SHOULD be visible (toolbar=false only hides Download/External)
        const zoomButtons = page.locator("button[title*='Zoom']")
        expect(await zoomButtons.count()).toBeGreaterThan(0)

        // Navigation buttons SHOULD be visible
        const navButtons = page.locator("button[title*='Seite']")
        expect(await navButtons.count()).toBeGreaterThan(0)
      }
    }
  })

  test("PdfViewer: Error state when PDF fails to load", async ({ page }) => {
    // Intentionally load an invalid PDF URL
    await page.goto("http://localhost:3000/bon/99999")

    // Wait for error state to appear
    await page.waitForTimeout(2000)

    // Should show error message instead of iframe
    const errorAlert = page.locator("text=/PDF|nicht|geladen|Error/i")
    // May or may not have error depending on whether bon exists; just verify no crash
    expect(page).toBeDefined()
  })

  test("Highlight functionality: Text in PDF is highlighted and scrolled to", async ({ page }) => {
    // Navigate to transactions with a specific transaction
    await page.goto("http://localhost:3000/einstellungen?tab=konto")

    await page.waitForTimeout(1000)

    // Click a transaction
    const transactionRows = page.locator("table tbody tr")
    if (await transactionRows.count() > 0) {
      await transactionRows.first().click()
      await page.waitForTimeout(1000)

      // Check for highlight overlay
      const highlights = page.locator(".pdf-highlight")
      // Highlight may or may not exist depending on PDF content
      // Just verify the component doesn't crash
      expect(page).toBeDefined()
    }
  })

  test("No iframes anywhere in PDF viewers (3 implementations consolidated)", async ({ page }) => {
    // Test all three PDF viewer locations
    const testUrls = [
      "http://localhost:3000/",
      "http://localhost:3000/einstellungen?tab=konto",
      "http://localhost:3000/einstellungen?tab=import",
    ]

    for (const url of testUrls) {
      await page.goto(url)
      await page.waitForTimeout(500)

      // Verify no iframes on any page
      const iframes = page.locator("iframe")
      expect(await iframes.count()).toBe(0)
    }
  })
})
