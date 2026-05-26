import { test, expect } from '@playwright/test';

test('PROJ-31: Debug PDF viewer state', async ({ page, context }) => {
  // Capture console messages
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  // Capture errors
  const pageErrors: string[] = [];
  page.on('pageerror', err => {
    pageErrors.push(err.toString());
  });
  
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  console.log('📍 Page loaded');
  console.log(`Console logs: ${consoleLogs.length}`);
  
  // Expand first group
  const groupHeader = page.locator('tbody tr').first();
  await groupHeader.click();
  await page.waitForTimeout(500);
  
  // Get the HTML of the first few transaction rows
  const rows = page.locator('tbody tr');
  const secondRow = rows.nth(1);
  const html = await secondRow.innerHTML();
  
  console.log('📄 Second row HTML (first 300 chars):');
  console.log(html.substring(0, 300));
  
  // Check if it has onclick handler
  const hasClickHandler = html.includes('onClick') || html.includes('onclick');
  console.log(`🖱️  Has click handler: ${hasClickHandler}`);
  
  // Check for paperless indicator
  const hasPaperless = html.toLowerCase().includes('paperless');
  console.log(`📎 Has paperless: ${hasPaperless}`);
  
  // Look for PDF viewer components
  const pdfViewerDiv = page.locator('[class*="pdf"], [class*="PDF"]');
  const pdfViewerCount = await pdfViewerDiv.count();
  console.log(`🎬 PDF viewer elements: ${pdfViewerCount}`);
  
  // Check for errors
  if (pageErrors.length > 0) {
    console.log('❌ Page errors:');
    pageErrors.forEach(err => console.log(`  - ${err}`));
  } else {
    console.log('✅ No page errors');
  }
});
