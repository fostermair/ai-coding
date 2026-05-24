import { test, expect } from '@playwright/test'

test.describe('PROJ-29: Transaction Year/Month Filter', () => {
  test('Year selector appears on Transaktionen page', async ({ page }) => {
    await page.goto('/transaktionen')
    await page.waitForLoadState('networkidle')

    // shadcn Select component has a trigger button
    const yearTrigger = page.locator('button:has-text("Alle Jahre")')
    await expect(yearTrigger).toBeVisible()
  })

  test('Month selector is hidden when no year is selected', async ({ page }) => {
    await page.goto('/transaktionen')
    await page.waitForLoadState('networkidle')

    // Month trigger should not be visible initially
    const monthTrigger = page.locator('button:has-text("Alle Monate")')
    await expect(monthTrigger).not.toBeVisible()
  })

  test('Month selector appears when year is selected', async ({ page }) => {
    await page.goto('/transaktionen')
    await page.waitForLoadState('networkidle')

    // Click year selector trigger
    const yearTrigger = page.locator('button:has-text("Alle Jahre")')
    await yearTrigger.click()

    // Select a year option (not "Alle Jahre")
    const yearOptions = page.locator('[role="option"]')
    const allYearsOption = await yearOptions.nth(0)
    const nextOption = await yearOptions.nth(1)

    if (nextOption) {
      await nextOption.click()

      // Wait for month selector to appear
      const monthTrigger = page.locator('button:has-text("Alle Monate")')
      await expect(monthTrigger).toBeVisible({ timeout: 5000 })
    }
  })

  test('Search and filter work together', async ({ page }) => {
    await page.goto('/transaktionen')
    await page.waitForLoadState('networkidle')

    // Fill in search query
    const searchInput = page.locator('input[placeholder*="suchen"]')
    await searchInput.fill('REWE')

    // Year filter should still be visible
    const yearTrigger = page.locator('button:has-text("Alle Jahre")')
    await expect(yearTrigger).toBeVisible()
  })
})
