import { test, expect } from '@playwright/test';

test('PROJ-31: Check row classes', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  const rows = page.locator('tbody tr');
  
  // Get class names for first 5 rows
  for (let i = 0; i < 5; i++) {
    const row = rows.nth(i);
    const classAttr = await row.getAttribute('class');
    const dataAttr = await row.getAttribute('data-*');
    
    console.log(`Row ${i}:`);
    console.log(`  Classes: ${classAttr}`);
    
    // Check for specific classes
    const hasCursorPointer = classAttr?.includes('cursor-pointer');
    const hasHoverBlue = classAttr?.includes('hover:bg-blue');
    const hasHoverGray = classAttr?.includes('hover:bg-gray');
    
    console.log(`  cursor-pointer: ${hasCursorPointer ? '✅' : '❌'}`);
    console.log(`  hover:bg-blue: ${hasHoverBlue ? '✅' : '❌'}`);
    console.log(`  hover:bg-gray: ${hasHoverGray ? '✅' : '❌'}`);
    console.log('');
  }
  
  // Also check if PDF mode is active
  const pdfButtons = page.locator('button[title="PDF anzeigen"], button[title="Zur Tabelle wechseln"]');
  for (let i = 0; i < Math.min(3, await pdfButtons.count()); i++) {
    const btn = pdfButtons.nth(i);
    const title = await btn.getAttribute('title');
    const isActive = await btn.evaluate(el => {
      const classes = el.getAttribute('class') || '';
      return classes.includes('text-blue');
    });
    console.log(`PDF Button ${i}: "${title}", Active: ${isActive ? '✅' : '❌'}`);
  }
});
