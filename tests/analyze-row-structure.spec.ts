import { test, expect } from '@playwright/test';

test('PROJ-31: Analyze row DOM structure', async ({ page }) => {
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  
  console.log(`\nAnalyzing ${rowCount} rows:\n`);
  
  for (let i = 0; i < Math.min(10, rowCount); i++) {
    const row = rows.nth(i);
    const html = await row.innerHTML();
    const text = await row.textContent();
    
    // Determine row type
    let type = 'UNKNOWN';
    if (html.includes('ChevronRight')) type = 'GROUP_HEADER';
    else if (html.includes('react-pdf')) type = 'PDF_VIEWER';
    else if (html.includes('tabular-nums')) type = 'TRANSACTION';
    else if (text?.includes('Kontoauszug')) type = 'ACCOUNT_INFO';
    
    // Check if clickable (has cursor-pointer or hover styles)
    const isClickable = html.includes('cursor-pointer');
    
    // Check for match status badge
    const hasMatchStatus = html.includes('match_status') || text?.includes('gematcht') || text?.includes('Offen');
    
    console.log(`Row ${i}: [${type}] Clickable: ${isClickable ? '✅' : '❌'} HasMatchStatus: ${hasMatchStatus ? '✅' : '❌'}`);
    console.log(`  Text preview: ${text?.substring(0, 60)}...`);
    console.log('');
  }
});
