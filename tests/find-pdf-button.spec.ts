import { test, expect } from '@playwright/test';

test('PROJ-31: Find PDF button and transaction rows', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  // Look for ALL buttons
  const allButtons = page.locator('button');
  const buttonCount = await allButtons.count();
  console.log(`📌 Total buttons on page: ${buttonCount}`);
  
  // Look for FileText buttons specifically
  const fileTextButtons = page.locator('button[title*="PDF"]');
  const fileTextCount = await fileTextButtons.count();
  console.log(`📄 FileText/PDF buttons: ${fileTextCount}`);
  
  // Get details on first few buttons
  for (let i = 0; i < Math.min(5, buttonCount); i++) {
    const btn = allButtons.nth(i);
    const title = await btn.getAttribute('title');
    const className = await btn.getAttribute('class');
    console.log(`Button ${i}: title="${title}", hasText="${className?.includes('text')}" `);
  }
  
  // Now let's look at the table structure
  const rows = page.locator('tbody tr');
  const firstRow = rows.first();
  const firstRowHtml = await firstRow.innerHTML();
  
  // Check if first row is a group header (has ChevronRight)
  const isGroupHeader = firstRowHtml.includes('ChevronRight');
  console.log(`\n🎯 First row is group header: ${isGroupHeader}`);
  
  if (isGroupHeader) {
    // This is a group header, look for the button in this row
    const btnInHeader = firstRow.locator('button');
    const btnCount = await btnInHeader.count();
    console.log(`📌 Buttons in group header: ${btnCount}`);
    
    for (let i = 0; i < btnCount; i++) {
      const btn = btnInHeader.nth(i);
      const title = await btn.getAttribute('title');
      console.log(`  Button ${i}: title="${title}"`);
    }
  }
});
