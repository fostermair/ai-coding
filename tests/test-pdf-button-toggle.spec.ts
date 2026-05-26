import { test, expect } from '@playwright/test';

test('PROJ-31: Test PDF button toggle', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  // Find the first PDF button
  const pdfBtn = page.locator('button[title="PDF anzeigen"]').first();
  const initialTitle = await pdfBtn.getAttribute('title');
  console.log(`\n📌 PDF Button initial title: "${initialTitle}"`);
  
  // Get initial canvas count
  const canvasBefore = page.locator('canvas');
  const countBefore = await canvasBefore.count();
  console.log(`📄 Canvas elements before: ${countBefore}`);
  
  // Click the button
  await pdfBtn.click();
  console.log('🖱️  Clicked PDF button');
  
  await page.waitForTimeout(2000);
  
  // Check title changed
  const titleAfter = await pdfBtn.getAttribute('title');
  console.log(`📌 PDF Button title after click: "${titleAfter}"`);
  
  // Check canvas count
  const canvasAfter = page.locator('canvas');
  const countAfter = await canvasAfter.count();
  console.log(`📄 Canvas elements after: ${countAfter}`);
  
  if (countAfter > countBefore) {
    console.log('✅ PDF mode toggled: canvas count increased!');
    
    // Now try clicking a transaction
    console.log('\n🎯 Clicking transaction row...');
    const txRow = page.locator('tbody tr').nth(1);
    await txRow.click();
    await page.waitForTimeout(1000);
    
    // Check highlights
    const highlights = page.locator('.tx-highlight');
    const hlCount = await highlights.count();
    console.log(`⭐ Highlights: ${hlCount}`);
  } else {
    console.log('❌ PDF mode NOT toggled');
  }
});
