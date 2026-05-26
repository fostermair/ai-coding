import { test, expect } from '@playwright/test';

test('PROJ-31: Check for errors when opening PDF', async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  
  page.on('pageerror', err => {
    errors.push(`Page error: ${err}`);
  });
  
  await page.goto('http://localhost:3000/transaktionen');
  await page.waitForLoadState('networkidle');
  
  // Click PDF button
  const pdfButton = page.locator('button[title="PDF anzeigen"]').first();
  await pdfButton.click();
  
  // Wait and check for content
  await page.waitForTimeout(2000);
  
  // Look for the PDF viewer container
  const pdfContainer = page.locator('[style*="height: 600px"]');
  const exists = await pdfContainer.count() > 0;
  console.log(`\n🎯 PDF container exists: ${exists}`);
  
  if (exists) {
    const html = await pdfContainer.first().innerHTML();
    console.log(`📄 Container HTML length: ${html.length}`);
    console.log(`Contains "react-pdf": ${html.includes('react-pdf')}`);
    console.log(`Contains "canvas": ${html.includes('<canvas')}`);
    console.log(`Contains "Loading": ${html.includes('Loading')}`);
    console.log(`Contains error: ${html.includes('error')}`);
  }
  
  console.log(`\n❌ Errors (${errors.length}):`);
  errors.forEach(e => console.log(`  - ${e.substring(0, 100)}`));
  
  console.log(`\n⚠️  Warnings (${warnings.length}):`);
  warnings.slice(0, 3).forEach(w => console.log(`  - ${w.substring(0, 100)}`));
});
