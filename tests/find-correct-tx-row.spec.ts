import { test, expect } from '@playwright/test';

test('PROJ-31: Find correct transaction row and PDF state', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  // Click PDF button first
  const pdfBtn = page.locator('button[title="PDF anzeigen"]').first();
  await pdfBtn.click();
  await page.waitForTimeout(2000);
  
  // Find which row contains the transaction data
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  
  console.log(`\nAnalyzing ${rowCount} rows after PDF button click:\n`);
  
  for (let i = 0; i < Math.min(12, rowCount); i++) {
    const row = rows.nth(i);
    const text = await row.textContent();
    const html = await row.innerHTML();
    
    // Check if row has date format
    const hasDate = text && /\d{2}\.\d{2}\.\d{4}/.test(text);
    // Check if it has PDF
    const isPDFViewer = html.includes('react-pdf');
    // Check for amount format
    const hasAmount = text && /[\-\+]\d+,\d{2}/.test(text);
    
    if (isPDFViewer) {
      console.log(`Row ${i}: [PDF VIEWER]`);
    } else if (hasDate && hasAmount) {
      console.log(`Row ${i}: [TRANSACTION] Date: ✅ Amount: ✅`);
      console.log(`  Text: ${text?.substring(0, 70)}`);
    } else {
      console.log(`Row ${i}: [OTHER] Date: ${hasDate ? '✅' : '❌'} Amount: ${hasAmount ? '✅' : '❌'}`);
      console.log(`  Text: ${text?.substring(0, 70)}`);
    }
  }
});
