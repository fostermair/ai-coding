import { test, expect } from "@playwright/test"

test.describe("PROJ-28: PDF-Viewer in Bon-Detailansicht (Tab-Layout)", () => {
  const bonIdWithPdf = "1322" // Known bon with paperless_doc_id
  const bonIdWithoutAvis = "1323" // Known bon without AVIS data

  test("AC-1: All three tabs are visible (Produkte, EBon, AVIS)", async ({ page }) => {
    await page.goto(`/bon/${bonIdWithPdf}`)

    const produkteTab = page.getByRole("tab", { name: "Produkte" })
    const ebonTab = page.getByRole("tab", { name: "EBon" })
    const avisTab = page.getByRole("tab", { name: "AVIS" })

    await expect(produkteTab).toBeVisible({ timeout: 10000 })
    await expect(ebonTab).toBeVisible()
    await expect(avisTab).toBeVisible()
  })

  test("AC-2: EBon tab is enabled when paperless_doc_id is set", async ({ page }) => {
    await page.goto(`/bon/${bonIdWithPdf}`)

    const ebonTab = page.getByRole("tab", { name: "EBon" })
    await expect(ebonTab).toBeEnabled()
  })

  test("AC-3: Clicking EBon tab shows PDF directly (no collapse/expand)", async ({ page }) => {
    await page.goto(`/bon/${bonIdWithPdf}`)

    const ebonTab = page.getByRole("tab", { name: "EBon" })
    const iframe = page.locator('iframe[title="eBon PDF"]')

    // Click EBon tab
    await ebonTab.click()

    // PDF should be visible immediately (not hidden/collapsed initially)
    await expect(iframe).toBeVisible({ timeout: 5000 })
  })

  test("AC-4: PDF iframe src points to correct API endpoint", async ({ page }) => {
    await page.goto(`/bon/${bonIdWithPdf}`)

    const ebonTab = page.getByRole("tab", { name: "EBon" })
    await ebonTab.click()

    const iframe = page.locator('iframe[title="eBon PDF"]')
    await expect(iframe).toBeVisible()

    const src = await iframe.getAttribute("src")
    expect(src).toMatch(/\/api\/bons\/\d+\/pdf/)
  })

  test("AC-5: AVIS tab is disabled when no AVIS data", async ({ page }) => {
    await page.goto(`/bon/${bonIdWithoutAvis}`)

    const avisTab = page.getByRole("tab", { name: "AVIS" })
    await expect(avisTab).toBeDisabled()
  })

  test("AC-6: Can switch between tabs (Produkte and EBon)", async ({ page }) => {
    await page.goto(`/bon/${bonIdWithPdf}`)

    const produkteTab = page.getByRole("tab", { name: "Produkte" })
    const ebonTab = page.getByRole("tab", { name: "EBon" })
    const iframe = page.locator('iframe[title="eBon PDF"]')

    // Start on Produkte tab (default)
    await expect(produkteTab).toHaveAttribute("aria-selected", "true")

    // Click EBon tab
    await ebonTab.click()
    await expect(ebonTab).toHaveAttribute("aria-selected", "true")
    await expect(iframe).toBeVisible()

    // Click back to Produkte tab
    await produkteTab.click()
    await expect(produkteTab).toHaveAttribute("aria-selected", "true")
    await expect(iframe).not.toBeVisible()
  })

  test("AC-7: AVIS tab shows PDF when available", async ({ page }) => {
    // Use a bon with AVIS data if available (this test is optional if no such bon exists)
    await page.goto(`/bon/${bonIdWithPdf}`)

    const avisTab = page.getByRole("tab", { name: "AVIS" })
    const avisEnabled = await avisTab.isEnabled()

    if (avisEnabled) {
      await avisTab.click()
      const avisIframe = page.locator('iframe[title="AVIS PDF"]')
      await expect(avisIframe).toBeVisible({ timeout: 5000 })
    }
  })
})
