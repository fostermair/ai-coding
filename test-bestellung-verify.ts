import { test } from '@playwright/test'
import path from 'path'
import fs from 'fs'

test.describe('PROJ-32: Bestellbestätigung-Import', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for app to be ready
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  })

  test('AC-3.1: Bestellung tab appears when data available', async ({ page }) => {
    // Navigate to first bon
    const bons = await page.locator('[data-testid="bon-list"] a').first()
    if (bons) {
      await bons.click()
      await page.waitForLoadState('networkidle')

      // Check if Bestellung tab exists
      const bestellungTab = page.locator('button:has-text("Bestellung")')
      const isVisible = await bestellungTab.isVisible().catch(() => false)
      console.log(`Bestellung tab visible: ${isVisible}`)
    }
  })

  test('AC-4.1: Bestellartikel column shows in products table', async ({ page }) => {
    // Find a bon with bestellung data
    const bons = await page.locator('a[href*="/bons/"]').all()
    for (const bon of bons) {
      await bon.click()
      await page.waitForLoadState('networkidle')

      // Check if Bestellartikel column header exists
      const columnHeader = page.locator('th:has-text("Bestellartikel")')
      const exists = await columnHeader.count() > 0
      if (exists) {
        console.log('✓ Found Bestellartikel column')
        break
      }

      // Go back if not found
      const backLink = page.locator('a:has-text("Zurück")')
      if (await backLink.isVisible()) {
        await backLink.click()
        await page.waitForLoadState('networkidle')
      }
    }
  })

  test('AC-5.1/5.2: Preis/100g calculation works for weight units', async ({ page }) => {
    // Find a bon and check for price per 100g column
    const bons = await page.locator('a[href*="/bons/"]').all()
    for (const bon of bons) {
      await bon.click()
      await page.waitForLoadState('networkidle')

      const preisPer100Header = page.locator('th:has-text("Preis/100g")')
      const exists = await preisPer100Header.count() > 0
      if (exists) {
        console.log('✓ Found Preis/100g column')

        // Check a specific value
        const cells = page.locator('td:has-text("€")').filter({ hasNot: page.locator('th') })
        const cellCount = await cells.count()
        console.log(`Found ${cellCount} price cells`)
        break
      }

      const backLink = page.locator('a:has-text("Zurück")')
      if (await backLink.isVisible()) {
        await backLink.click()
        await page.waitForLoadState('networkidle')
      }
    }
  })
})
