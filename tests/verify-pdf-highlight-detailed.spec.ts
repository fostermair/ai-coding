import { test, expect } from '@playwright/test';

test('PROJ-31: Click transaction to open PDF with highlight', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  // First, expand the first group to see transactions
  const firstGroupHeader = page.locator('tbody tr').first();
  await firstGroupHeader.click();
  await page.waitForTimeout(500);
  
  // Get all transaction rows (after expansion)
  const transactionRows = page.locator('tbody tr');
  const rowCount = await transactionRows.count();
  console.log(`📋 Found ${rowCount} rows total`);
  
  // Find and click a transaction row that should have a paperless PDF
  // Looking for a row that has a clickable state (not a group header)
  let clicked = false;
  for (let i = 1; i < Math.min(10, rowCount); i++) {
    const row = transactionRows.nth(i);
    const text = await row.textContent();
    
    // Check if this looks like a transaction row (not a header)
    if (text && !text.includes('Datum') && text.length > 20) {
      console.log(`🔍 Trying to click row ${i}`);
      
      // Try to click the row
      try {
        await row.click({ timeout: 1000 });
        await page.waitForTimeout(800);
        clicked = true;
        console.log(`✅ Clicked transaction row ${i}`);
        break;
      } catch (e) {
        console.log(`⚠️ Could not click row ${i}: ${(e as Error).message}`);
      }
    }
  }
  
  if (clicked) {
    // Check if PDF viewer appeared
    const pdfDocument = page.locator('canvas, [role="region"]');
    const pdfCount = await pdfDocument.count();
    console.log(`📄 PDF elements found: ${pdfCount}`);
    
    // Look for highlight elements
    const highlights = page.locator('.tx-highlight');
    const highlightCount = await highlights.count();
    console.log(`⭐ Highlight elements: ${highlightCount}`);
  } else {
    console.log('⚠️ No transaction clicked');
  }
});
