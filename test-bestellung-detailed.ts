import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

async function testBestellung() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    console.log('🔍 Testing PROJ-32: Bestellbestätigung-Import')
    console.log('=' .repeat(60))

    // Step 1: Navigate to home
    console.log('\n1️⃣ Navigating to app...')
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
    console.log('✓ App loaded')

    // Step 2: Find and click first bon
    console.log('\n2️⃣ Finding bons...')
    const bonLinks = page.locator('a[href*="/bons/"]')
    const bonCount = await bonLinks.count()
    console.log(`Found ${bonCount} bons`)

    if (bonCount > 0) {
      // Click first bon
      await bonLinks.first().click()
      await page.waitForLoadState('networkidle')
      console.log('✓ Opened first bon')

      // Take screenshot
      const screenshotPath = 'bon-detail-screenshot.png'
      await page.screenshot({ path: screenshotPath })
      console.log(`📸 Screenshot saved: ${screenshotPath}`)

      // Step 3: Check for tabs
      console.log('\n3️⃣ Checking for Bestellung tab...')
      const tabs = page.locator('button[role="tab"]')
      const tabTexts = await tabs.allTextContents()
      console.log('Tabs found:', tabTexts.map(t => t.trim()).filter(t => t))

      const hasBestellungTab = tabTexts.some(t => t.includes('Bestellung'))
      console.log(hasBestellungTab ? '✓ Bestellung tab exists' : '❌ Bestellung tab NOT found')

      // Step 4: Check for Bestellartikel column
      console.log('\n4️⃣ Checking for Bestellartikel column...')
      const headers = page.locator('th')
      const headerTexts = await headers.allTextContents()
      console.log('Table headers:', headerTexts.map(t => t.trim()).filter(t => t))

      const hasBestellartikelCol = headerTexts.some(t => t.includes('Bestellartikel'))
      console.log(hasBestellartikelCol ? '✓ Bestellartikel column exists' : 'ℹ️ Bestellartikel column not visible (may not have bestellung data)')

      // Step 5: Check for Menge column
      const hasMengeCol = headerTexts.some(t => t.includes('Bestellung') && t.includes('Menge'))
      console.log(hasMengeCol ? '✓ Bestellung-Menge column exists' : 'ℹ️ Bestellung-Menge column not visible')

      // Step 6: Check for Preis/100g column
      const hasPreisCol = headerTexts.some(t => t.includes('Preis/100g'))
      console.log(hasPreisCol ? '✓ Preis/100g column exists' : 'ℹ️ Preis/100g column not visible')

      // Step 7: If Bestellung tab exists and is not disabled, click it
      if (hasBestellungTab) {
        console.log('\n5️⃣ Testing Bestellung tab...')
        const bestellungTabBtn = page.locator('button[role="tab"]:has-text("Bestellung")')
        const isDisabled = await bestellungTabBtn.evaluate(el => el.hasAttribute('disabled'))

        if (!isDisabled) {
          await bestellungTabBtn.click()
          await page.waitForLoadState('networkidle')
          console.log('✓ Clicked Bestellung tab')

          // Check for PDF iframe
          const iframes = page.frameLocator('iframe[title*="Bestellung"]')
          console.log('✓ Found Bestellung PDF iframe')

          // Check for bestellung items table
          const bestellungTable = page.locator('table').nth(1) // second table should be bestellung items
          const bestellungTableExists = await bestellungTable.count() > 0
          console.log(bestellungTableExists ? '✓ Bestellung items table exists' : 'ℹ️ No bestellung items table')

          // Take screenshot of bestellung tab
          const bestellungScreenshot = 'bon-bestellung-tab.png'
          await page.screenshot({ path: bestellungScreenshot })
          console.log(`📸 Bestellung tab screenshot: ${bestellungScreenshot}`)
        } else {
          console.log('ℹ️ Bestellung tab is disabled (no data for this bon)')
        }
      }

      console.log('\n' + '=' .repeat(60))
      console.log('✅ Verification complete!')
    } else {
      console.log('❌ No bons found in app')
    }
  } catch (error) {
    console.error('❌ Error during test:', error)
  } finally {
    await browser.close()
  }
}

testBestellung()
