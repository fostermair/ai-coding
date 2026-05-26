import { test, expect } from '@playwright/test';

test('PROJ-31: Click PDF button, then click transaction', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  // Find and click the "PDF anzeigen" button
  const pdfButtons = page.locator('button[title="PDF anzeigen"]');
  console.log(`✅ Found ${await pdfButtons.count()} PDF buttons`);
  
  const firstPdfButton = pdfButtons.first();
  await firstPdfButton.click();
  console.log('🖱️  Clicked first PDF button');
  
  // Wait for PDF to load
  await page.waitForTimeout(2000);
  
  // Check if PDF viewer is visible (look for react-pdf elements)
  const pdfPages = page.locator('[role="region"]');
  const pageCount = await pdfPages.count();
  console.log(`📄 PDF pages found: ${pageCount}`);
  
  // Look for canvas elements (PDF rendering)
  const canvases = page.locator('canvas');
  const canvasCount = await canvases.count();
  console.log(`🎨 Canvas elements: ${canvasCount}`);
  
  // Now try to click a transaction row
  // Transaction rows should appear when PDF is NOT in view, or we need to scroll
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  console.log(`📋 Total rows: ${rowCount}`);
  
  // Get the text of a few rows to find an actual transaction
  for (let i = 0; i < Math.min(15, rowCount); i++) {
    const row = rows.nth(i);
    const text = await row.textContent();
    const hasDate = text && /\d{2}\.\d{2}\.\d{4}/.test(text);
    
    if (hasDate) {
      console.log(`\n🎯 Found transaction row at index ${i}`);
      console.log(`   Text: ${text?.substring(0, 100)}`);
      
      // Try to click it
      try {
        // Check if row is clickable (has hover effect)
        await row.click();
        console.log('✅ Clicked transaction row');
        
        // Wait for any state changes
        await page.waitForTimeout(1000);
        
        // Check for highlight elements
        const highlights = page.locator('.tx-highlight');
        const highlightCount = await highlights.count();
        console.log(`⭐ Highlight elements found: ${highlightCount}`);
        
        if (highlightCount > 0) {
          console.log('🎉 SUCCESS: Highlight applied!');
        }
        break;
      } catch (e) {
        console.log(`⚠️  Could not click row: ${(e as Error).message}`);
      }
    }
  }
});
