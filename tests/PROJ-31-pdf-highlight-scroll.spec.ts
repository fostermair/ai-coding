import { test, expect } from '@playwright/test'

test.describe('PROJ-31: PDF-Highlight & Auto-Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transaktionen')
    await page.waitForLoadState('networkidle')
  })

  test('clicking a transaction row with Paperless PDF opens the PDF', async ({ page }) => {
    // Find first transaction with [paperless] prefix
    const rows = await page.locator('tbody tr')
    let transactionRowFound = false

    for (let i = 0; i < await rows.count(); i++) {
      const row = rows.nth(i)
      const text = await row.textContent()

      // Look for a transaction row (not a group header) with paperless PDF
      if (text && text.includes('[paperless]')) {
        // Check if this is a transaction row (has match status badge)
        const statusBadge = await row.locator('[class*="bg-"]').count()
        if (statusBadge > 0) {
          // Click this transaction row
          await row.click()
          transactionRowFound = true
          break
        }
      }
    }

    expect(transactionRowFound).toBe(true)

    // Wait for PDF viewer to appear
    const pdfViewer = page.locator('div[role="doc-pagebreak"]').first()
    await expect(pdfViewer).toBeVisible({ timeout: 10000 })
  })

  test('clicking same transaction row again closes the PDF', async ({ page }) => {
    // Find and click a transaction with paperless PDF
    const rows = await page.locator('tbody tr')
    let targetRow: any = null

    for (let i = 0; i < await rows.count(); i++) {
      const row = rows.nth(i)
      const text = await row.textContent()

      if (text && text.includes('[paperless]')) {
        const statusBadge = await row.locator('[class*="bg-"]').count()
        if (statusBadge > 0) {
          targetRow = row
          break
        }
      }
    }

    expect(targetRow).not.toBeNull()

    // Click to open PDF
    await targetRow.click()
    await page.waitForTimeout(500)

    // Verify PDF is visible
    const pdfViewer = page.locator('div').filter({ has: page.locator('canvas') })
    const initialCount = await pdfViewer.count()
    expect(initialCount).toBeGreaterThan(0)

    // Click again to close
    await targetRow.click()
    await page.waitForTimeout(500)

    // PDF should be hidden (no more PDF viewer in expanded group section)
    const pdfViewerAfter = page.locator('iframe[src*="/api/konto/statements"]')
    await expect(pdfViewerAfter).not.toBeVisible({ timeout: 5000 })
  })

  test('clicking different transaction in same group shifts highlight', async ({ page }) => {
    // Find first group header
    const groupRow = page.locator('tbody tr').first()
    const groupText = await groupRow.textContent()

    // Click group to expand
    if (groupText && !groupText.includes('€')) {
      await groupRow.click()
      await page.waitForTimeout(300)
    }

    // Find two transactions with paperless PDF in same group
    const rows = await page.locator('tbody tr')
    const transactionsInGroup = []

    for (let i = 0; i < await rows.count(); i++) {
      const row = rows.nth(i)
      const text = await row.textContent()

      if (text && text.includes('[paperless]') && text.includes('€')) {
        // This is a transaction row
        transactionsInGroup.push(row)
        if (transactionsInGroup.length >= 2) break
      }
    }

    expect(transactionsInGroup.length).toBeGreaterThanOrEqual(2)

    // Click first transaction
    await transactionsInGroup[0].click()
    await page.waitForTimeout(500)

    // Verify PDF is open
    const pdfFirst = page.locator('div').filter({ has: page.locator('canvas') })
    const countFirst = await pdfFirst.count()
    expect(countFirst).toBeGreaterThan(0)

    // Click second transaction
    await transactionsInGroup[1].click()
    await page.waitForTimeout(500)

    // PDF should still be visible (highlight shifted, not closed)
    const pdfSecond = page.locator('div').filter({ has: page.locator('canvas') })
    const countSecond = await pdfSecond.count()
    expect(countSecond).toBeGreaterThan(0)
  })

  test('group FileText button opens PDF without highlight', async ({ page }) => {
    // Find a group with Paperless PDF
    const groupRow = page.locator('tbody tr').first()
    const fileTextButton = groupRow.locator('button').filter({ has: page.locator('svg') }).last()

    // Click FileText button
    await fileTextButton.click()
    await page.waitForTimeout(500)

    // Verify PDF opens without highlighting
    const pdfViewer = page.locator('div').filter({ has: page.locator('canvas') })
    await expect(pdfViewer).toBeVisible({ timeout: 10000 })

    // Check that there's no yellow highlight overlay
    const yellowHighlight = page.locator('div[style*="yellow"]')
    await expect(yellowHighlight).not.toBeVisible()
  })

  test('closing PDF via close button works', async ({ page }) => {
    // Find and click a transaction with paperless PDF
    const rows = await page.locator('tbody tr')
    let targetRow: any = null

    for (let i = 0; i < await rows.count(); i++) {
      const row = rows.nth(i)
      const text = await row.textContent()

      if (text && text.includes('[paperless]')) {
        const statusBadge = await row.locator('[class*="bg-"]').count()
        if (statusBadge > 0) {
          targetRow = row
          break
        }
      }
    }

    if (targetRow) {
      await targetRow.click()
      await page.waitForTimeout(500)

      // Find and click the close button (X icon)
      const closeButton = page.locator('button').filter({ has: page.locator('svg').filter({ hasText: 'X' }) })
      if (await closeButton.count() > 0) {
        await closeButton.first().click()
        await page.waitForTimeout(500)

        // PDF should be closed
        const pdfViewer = page.locator('div').filter({ has: page.locator('canvas') })
        const count = await pdfViewer.count()
        expect(count).toBe(0)
      }
    }
  })
})
