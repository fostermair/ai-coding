import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  
  // Click on first bon
  const firstLink = await page.$('a[href*="/bon/"]')
  if (firstLink) {
    await firstLink.click()
    await page.waitForNavigation()
    
    // Check badges on detail page
    const images = await page.$$eval('img[src*="/badges/"]', imgs => imgs.map(img => ({ src: img.src, alt: img.alt })))
    
    console.log('Detail page badge images:')
    images.forEach(img => console.log(`  - ${img.alt}: ${img.src}`))
    
    await page.screenshot({ path: 'screenshot-detail.png' })
    console.log('Detail screenshot saved: screenshot-detail.png')
  } else {
    console.log('No bon link found')
  }
  
} catch (e) {
  console.error('Error:', e.message)
} finally {
  await browser.close()
}
