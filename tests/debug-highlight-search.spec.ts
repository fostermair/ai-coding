import { test, expect } from '@playwright/test';

test('PROJ-31: Debug highlight search with console logging', async ({ page }) => {
  // Capture all console logs
  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.text().includes('[PDF Viewer]')) {
      logs.push(`[${msg.type()}] ${msg.text()}`);
      console.log(msg.text());
    }
  });
  
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  console.log('\n=== Step 1: Click PDF button ===');
  const pdfBtn = page.locator('button[title="PDF anzeigen"]').first();
  await pdfBtn.click();
  await page.waitForTimeout(2000);
  
  console.log('\n=== Step 2: Click transaction row ===');
  const txRow = page.locator('tbody tr').nth(1);
  const txText = await txRow.textContent();
  console.log(`Transaction: ${txText?.substring(0, 60)}`);
  
  await txRow.click();
  await page.waitForTimeout(1000);
  
  console.log('\n=== Console logs ===');
  logs.forEach(log => console.log(log));
  
  // Check highlights
  const highlights = page.locator('.tx-highlight');
  const count = await highlights.count();
  console.log(`\nHighlights found: ${count}`);
});
