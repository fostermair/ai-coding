import { test, expect } from '@playwright/test'

test.describe('PROJ-30: Backup & Restore', () => {
  test('Settings dialog opens and backup section is visible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click the settings button (gear icon with title="Konfiguration")
    const settingsButton = page.locator('button[title="Konfiguration"]')
    await settingsButton.click()

    // Look for backup section heading
    const backupHeading = page.locator('text=Datenbackup Verwaltung')
    await expect(backupHeading).toBeVisible({ timeout: 5000 })
  })

  test('Backup creation button exists', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Open settings
    const settingsButton = page.locator('button[title="Konfiguration"]')
    await settingsButton.click()

    // Find backup create button
    const backupButton = page.locator('button:has-text("Backup erstellen")')
    await expect(backupButton).toBeVisible({ timeout: 5000 })
  })

  test('Backup restore button exists', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Open settings
    const settingsButton = page.locator('button[title="Konfiguration"]')
    await settingsButton.click()

    // Find restore button (label with specific text)
    const restoreButton = page.locator('label:has-text("Backup laden")')
    await expect(restoreButton).toBeVisible({ timeout: 5000 })
  })

  test('Backup timestamp displays correctly', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Open settings
    const settingsButton = page.locator('button[title="Konfiguration"]')
    await settingsButton.click()

    // Check for timestamp text (should show either "Letztes Backup" or "Kein Backup")
    const timestampText = page.locator('text=/Letztes Backup|Kein Backup/')
    await expect(timestampText).toBeVisible({ timeout: 5000 })
  })
})
