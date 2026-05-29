import { test, expect } from '@playwright/test'

test.describe('PROJ-48: Navigations-Konsolidierung', () => {
  test('AC1: Topbar shows 3 main links + Import button + Config button', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // Check for new navigation links
    const uebersichtLink = page.locator('nav a', { hasText: 'Übersicht' })
    const analyseLink = page.locator('nav a', { hasText: 'Analyse' })
    const einstellungenLink = page.locator('nav a', { hasText: 'Einstellungen' })

    await expect(uebersichtLink).toBeVisible()
    await expect(analyseLink).toBeVisible()
    await expect(einstellungenLink).toBeVisible()

    // Check for buttons
    const importButton = page.locator('nav button', { hasText: 'Import' })
    const configButton = page.locator('nav button[title="Konfiguration"]')

    await expect(importButton).toBeVisible()
    await expect(configButton).toBeVisible()
  })

  test('AC2: / shows Übersicht with BonList and placeholder card', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // Check heading
    await expect(page.locator('h1:has-text("Übersicht")')).toBeVisible()

    // Check for placeholder card
    await expect(page.locator('text=Achtung & Tipps')).toBeVisible()

    // Check for "Alle Bons" heading
    await expect(page.locator('h2:has-text("Alle Bons")')).toBeVisible()
  })

  test('AC3: /analyse shows Tabs for Statistiken and Produkte', async ({ page }) => {
    await page.goto('http://localhost:3000/analyse')

    // Check heading
    await expect(page.locator('h1:has-text("Analyse")')).toBeVisible()

    // Check for tabs
    const statistikenTab = page.locator('button:has-text("Statistiken")')
    const produkteTab = page.locator('button:has-text("Produkte")')

    await expect(statistikenTab).toBeVisible()
    await expect(produkteTab).toBeVisible()

    // Statistiken should be active by default
    await expect(statistikenTab).toHaveAttribute('data-state', 'active')
  })

  test('AC3b: /analyse?tab=produkte shows Products tab active', async ({ page }) => {
    await page.goto('http://localhost:3000/analyse?tab=produkte')

    const produkteTab = page.locator('button:has-text("Produkte")')
    await expect(produkteTab).toHaveAttribute('data-state', 'active')
  })

  test('AC4: /einstellungen shows all required tabs', async ({ page }) => {
    await page.goto('http://localhost:3000/einstellungen')

    // Check all tabs exist
    await expect(page.locator('button:has-text("Kontoauszüge")')).toBeVisible()
    await expect(page.locator('button:has-text("Bestellungen")')).toBeVisible()
    await expect(page.locator('button:has-text("HelloFresh")')).toBeVisible()
    await expect(page.locator('button:has-text("Backup")')).toBeVisible()
    await expect(page.locator('button:has-text("Import")')).toBeVisible()

    // Konto should be active by default
    const kontoTab = page.locator('button:has-text("Kontoauszüge")')
    await expect(kontoTab).toHaveAttribute('data-state', 'active')
  })

  test('AC5: Import button opens modal', async ({ page }) => {
    await page.goto('http://localhost:3000')

    const importButton = page.locator('button:has-text("Import")').first()
    await importButton.click()

    // Check for modal title
    await expect(page.locator('text=eBon importieren')).toBeVisible()
  })

  test('AC5b: Import modal can be closed', async ({ page }) => {
    await page.goto('http://localhost:3000')

    const importButton = page.locator('button:has-text("Import")').first()
    await importButton.click()

    await expect(page.locator('text=eBon importieren')).toBeVisible()

    // Close via Escape key
    await page.keyboard.press('Escape')

    await expect(page.locator('text=eBon importieren')).not.toBeVisible()
  })

  test('AC6: Redirect /import to /', async ({ page }) => {
    await page.goto('http://localhost:3000/import')

    // Should redirect to home
    await expect(page).toHaveURL('http://localhost:3000/')
    await expect(page.locator('h1:has-text("Übersicht")')).toBeVisible()
  })

  test('AC6b: Redirect /produkte to /analyse?tab=produkte', async ({ page }) => {
    await page.goto('http://localhost:3000/produkte')

    // Should redirect with tab parameter
    await page.waitForURL(/\/analyse.*tab=produkte/)
    const produkteTab = page.locator('button:has-text("Produkte")')
    await expect(produkteTab).toHaveAttribute('data-state', 'active')
  })

  test('AC6c: Redirect /statistiken to /analyse?tab=statistiken', async ({ page }) => {
    await page.goto('http://localhost:3000/statistiken')

    await page.waitForURL(/\/analyse.*tab=statistiken/)
    const statistikenTab = page.locator('button:has-text("Statistiken")')
    await expect(statistikenTab).toHaveAttribute('data-state', 'active')
  })

  test('AC6d: Redirect /transaktionen to /einstellungen?tab=konto', async ({ page }) => {
    await page.goto('http://localhost:3000/transaktionen')

    await page.waitForURL(/\/einstellungen.*tab=konto/)
    const kontoTab = page.locator('button:has-text("Kontoauszüge")')
    await expect(kontoTab).toHaveAttribute('data-state', 'active')
  })

  test('AC7: Deep-link /bon/[id] still works', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // Get the first link that contains a number (likely a bon ID)
    const allLinks = await page.locator('a').all()
    let foundBonLink = false

    for (const link of allLinks) {
      const href = await link.getAttribute('href')
      if (href && href.startsWith('/bon/')) {
        await page.goto(`http://localhost:3000${href}`)
        // If we reach here without error, the link works
        await expect(page).toHaveURL(/\/bon\//)
        foundBonLink = true
        break
      }
    }

    expect(foundBonLink).toBe(true)
  })

  test('EC1: /analyse without tab parameter defaults to Statistiken', async ({ page }) => {
    await page.goto('http://localhost:3000/analyse')

    const statistikenTab = page.locator('button:has-text("Statistiken")')
    await expect(statistikenTab).toHaveAttribute('data-state', 'active')
  })

  test('EC2: /einstellungen without tab parameter defaults to Konto', async ({ page }) => {
    await page.goto('http://localhost:3000/einstellungen')

    const kontoTab = page.locator('button:has-text("Kontoauszüge")')
    await expect(kontoTab).toHaveAttribute('data-state', 'active')
  })

  test('EC3: Tab state is bookmarkable via URL parameters', async ({ page }) => {
    // Navigate directly to a URL with tab parameter
    await page.goto('http://localhost:3000/analyse?tab=produkte')

    // Verify URL is preserved
    await expect(page).toHaveURL(/tab=produkte/)

    // Tab should be active
    const produkteTab = page.locator('button:has-text("Produkte")')
    await expect(produkteTab).toHaveAttribute('data-state', 'active')

    // Reload and verify it persists
    await page.reload()
    await expect(produkteTab).toHaveAttribute('data-state', 'active')
  })

  test('EC4: Config button opens ConfigDialog unchanged', async ({ page }) => {
    await page.goto('http://localhost:3000')

    const configButton = page.locator('button[title="Konfiguration"]')
    await configButton.click()

    // Check for config dialog
    await expect(page.locator('text=Konfiguration')).toBeVisible()
  })

  test('Navigation: Active link gets correct styling', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // Übersicht link should have bg-gray-100
    const uebersichtLink = page.locator('nav a:has-text("Übersicht")')
    await expect(uebersichtLink).toHaveClass(/bg-gray-100/)

    // Click Analyse
    const analyseLink = page.locator('nav a:has-text("Analyse")')
    await analyseLink.click()

    await page.waitForURL(/\/analyse/)

    // Now Analyse should be active, Übersicht should not
    await expect(analyseLink).toHaveClass(/bg-gray-100/)
    await expect(uebersichtLink).not.toHaveClass(/bg-gray-100/)
  })
})
