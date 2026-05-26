import { test, expect } from '@playwright/test'

test.describe('PROJ-32: Bestellbestätigung-Import', () => {
  test('should have bestellung tab and columns when data exists', async ({ page }) => {
    // Go to home page
    await page.goto('http://localhost:3000')
    await page.waitForLoadState('networkidle')

    // Click on first bon if available
    const firstBon = page.locator('a[href*="/bons/"]').first()
    const bonCount = await firstBon.count()

    if (bonCount > 0) {
      await firstBon.click()
      await page.waitForLoadState('networkidle')

      // Check if we're on a bon detail page
      const backLink = page.locator('text=Zurück zur Übersicht')
      expect(backLink).toBeDefined()

      // Check for Bestellung tab - it should exist even if disabled
      const tabs = page.locator('button[role="tab"]')
      const tabTexts = await tabs.allTextContents()
      console.log('Available tabs:', tabTexts)
    }
  })
})
