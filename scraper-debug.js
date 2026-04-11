require('dotenv').config()
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  await page.goto('https://www.dlds.cl/login')
  await page.waitForLoadState('networkidle')
  await page.fill('input[type="email"]', process.env.DLDS_EMAIL)
  await page.fill('input[type="password"]', process.env.DLDS_PASSWORD)
  await page.click('button:has-text("Iniciar Sesión")')
  await page.waitForURL('https://www.dlds.cl/')

  const todasLasUrls = new Set()

  for (const seccion of ['Grow', 'Smoke', 'Semillas']) {
    // Cerrar menu si esta abierto
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await page.click('button:has-text("CATEGORÍAS")')
    await page.waitForTimeout(1500)
    await page.click(`text=${seccion}`)
    await page.waitForTimeout(2000)

    const links = await page.$$eval('a[href^="/c/"]', els =>
      [...new Set(els.map(a => a.href))].filter(h => h.includes('/c/'))
    )
    links.forEach(l => todasLasUrls.add(l))
    console.log(`${seccion}: ${links.length} links`)
  }

  console.log('\nTodas las URLs:')
  todasLasUrls.forEach(u => console.log(u))
  console.log(`\nTotal: ${todasLasUrls.size} URLs`)

  await browser.close()
}

main()