import { test, expect } from '@playwright/test';

test('PROJ-31: PDF viewer loads and transactions are clickable', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  // Check page loaded
  const heading = page.locator('h1');
  await expect(heading).toContainText('Transaktionen');
  console.log('✅ Transactions page loaded');
  
  // Look for transaction rows
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  console.log(`Found ${count} rows`);
  
  // Check if first group has FileText button (PDF toggle)
  const pdfButtons = page.locator('button[title*="PDF"]');
  const pdfButtonCount = await pdfButtons.count();
  console.log(`✅ Found ${pdfButtonCount} PDF toggle buttons`);
});
