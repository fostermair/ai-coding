import { test, expect } from '@playwright/test';

test('PROJ-31: Inspect transaction rows', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  
  console.log(`\n📋 Total rows: ${count}\n`);
  
  // Inspect first 5 rows
  for (let i = 0; i < Math.min(5, count); i++) {
    const row = rows.nth(i);
    const html = await row.innerHTML();
    const text = await row.textContent();
    
    // Check row type
    const isGroupHeader = html.includes('ChevronRight');
    const isPdfViewer = html.includes('react-pdf') || text?.includes('PDF');
    const hasFileTextButton = html.includes('FileText');
    
    console.log(`Row ${i}:`);
    console.log(`  Type: ${isGroupHeader ? 'GROUP HEADER' : isPdfViewer ? 'PDF VIEWER' : 'TRANSACTION'}`);
    console.log(`  Text: ${text?.substring(0, 80)}`);
    console.log(`  FileText button: ${hasFileTextButton ? '✅' : '❌'}`);
    console.log('');
  }
});
