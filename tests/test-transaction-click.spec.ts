import { test, expect } from '@playwright/test';

test('PROJ-31: Click transaction row to open PDF with highlight', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  console.log('\n✅ Page loaded\n');
  
  // Click row 1 (first transaction with paperless PDF)
  const row1 = page.locator('tbody tr').nth(1);
  const text1 = await row1.textContent();
  console.log(`Clicking row 1: ${text1?.substring(0, 60)}`);
  
  await row1.click();
  await page.waitForTimeout(2000);
  
  // Check for PDF viewer elements
  const canvas = page.locator('canvas');
  const canvasCount = await canvas.count();
  console.log(`📄 Canvas elements: ${canvasCount}`);
  
  // Check for highlights
  const highlights = page.locator('.tx-highlight');
  const highlightCount = await highlights.count();
  console.log(`⭐ Highlight elements: ${highlightCount}`);
  
  if (highlightCount > 0) {
    const highlightHtml = await highlights.first().evaluate(el => el.outerHTML);
    console.log(`✅ Highlight HTML: ${highlightHtml.substring(0, 150)}`);
  } else {
    console.log('⚠️  No highlights');
  }
  
  // Check component state by looking for data attributes or state indicators
  const pdfSection = page.locator('[style*="height: 600px"]');
  const pdfSectionCount = await pdfSection.count();
  console.log(`📦 PDF container sections: ${pdfSectionCount}`);
  
  // If PDF mode was toggled, clicking a transaction should open/show the PDF
  // Check if we need to click the PDF button first
  console.log('\n--- Now testing with PDF button clicked first ---\n');
  
  // Navigate back to clear state
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  // Click PDF button first
  const pdfButton = page.locator('button[title="PDF anzeigen"]').first();
  await pdfButton.click();
  console.log('Clicked PDF button');
  await page.waitForTimeout(2000);
  
  // Now click a transaction row
  const row2 = page.locator('tbody tr').nth(1);
  console.log('Clicking transaction row');
  await row2.click();
  await page.waitForTimeout(1500);
  
  // Check for highlights
  const highlights2 = page.locator('.tx-highlight');
  const count2 = await highlights2.count();
  console.log(`⭐ Highlight count after PDF+Click: ${count2}`);
  
  if (count2 > 0) {
    console.log('✅ SUCCESS: Highlight appeared!');
  }
});
