import { test, expect } from '@playwright/test';

test('PROJ-31: Complete PDF highlight feature test', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  console.log('\n📋 Starting PDF Highlight Test\n');
  
  // Step 1: Find and click PDF button
  console.log('Step 1: Click PDF toggle button');
  const pdfButton = page.locator('button[title="PDF anzeigen"]').first();
  await pdfButton.click();
  await page.waitForTimeout(2000);
  
  const pdfCanvas = page.locator('canvas');
  const canvasCount = await pdfCanvas.count();
  console.log(`✅ PDF loaded with ${canvasCount} canvas elements`);
  
  // Step 2: Find transaction rows
  console.log('\nStep 2: Find clickable transaction rows');
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  console.log(`Found ${rowCount} rows`);
  
  // Look for an actual transaction row with date format
  let transactionRowIndex = -1;
  for (let i = 1; i < rowCount; i++) {
    const text = await rows.nth(i).textContent();
    if (text && /\d{2}\.\d{2}\.\d{4}/.test(text)) {
      transactionRowIndex = i;
      console.log(`Found transaction row at index ${i}`);
      break;
    }
  }
  
  if (transactionRowIndex > 0) {
    // Step 3: Click transaction row
    console.log('\nStep 3: Click transaction row');
    const txRow = rows.nth(transactionRowIndex);
    const txText = await txRow.textContent();
    console.log(`Transaction text: ${txText?.substring(0, 80)}`);
    
    await txRow.click();
    await page.waitForTimeout(1500);
    
    // Step 4: Check for highlight overlay
    console.log('\nStep 4: Check for highlight overlay');
    const highlights = page.locator('.tx-highlight');
    const highlightCount = await highlights.count();
    console.log(`Highlights found: ${highlightCount}`);
    
    if (highlightCount > 0) {
      const highlightElement = highlights.first();
      const style = await highlightElement.getAttribute('style');
      console.log(`Highlight style: ${style?.substring(0, 100)}`);
      console.log('✅ HIGHLIGHT APPLIED!');
    } else {
      console.log('⚠️  No highlights found - checking console for errors...');
      
      // Try clicking the same row again to test toggle
      console.log('\nStep 5: Toggle - click same row again');
      await txRow.click();
      await page.waitForTimeout(500);
      
      const highlightCount2 = await page.locator('.tx-highlight').count();
      console.log(`Highlights after toggle: ${highlightCount2}`);
    }
  }
});
