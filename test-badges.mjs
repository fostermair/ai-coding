import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  
  // Wait for table to load
  await page.waitForSelector('table', { timeout: 5000 })
  
  // Check if images exist in the DOM
  const chainImages = await page.$$eval('img[src*="/badges/"]', imgs => imgs.map(img => ({ src: img.src, alt: img.alt })))
  
  console.log('Found badge images:')
  chainImages.forEach(img => console.log(`  - ${img.alt}: ${img.src}`))
  
  if (chainImages.length > 0) {
    console.log('\n✓ Badge images are rendering!')
  } else {
    console.log('\n✗ No badge images found')
  }
  
  // Take a screenshot
  await page.screenshot({ path: 'screenshot-bons.png' })
  console.log('Screenshot saved: screenshot-bons.png')
  
} catch (e) {
  console.error('Error:', e.message)
} finally {
  await browser.close()
}
