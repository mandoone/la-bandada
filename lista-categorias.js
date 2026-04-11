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

  const todas = new Set()
  for (const seccion of ['Grow', 'Smoke']) {
    await page.goto('https://www.dlds.cl/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.click('button:has-text("CATEGORÍAS")')
    await page.waitForTimeout(1500)
    await page.click(`text=${seccion}`)
    await page.waitForTimeout(2000)
    const links = await page.$$eval('a[href^="/c/"]', els =>
      [...new Set(els.map(a => a.href))].filter(h =>
        h.replace('https://www.dlds.cl/c/', '').split('/').length === 3
      )
    )
    links.forEach(l => todas.add(l))
  }

  const arr = [...todas]
  arr.forEach((url, i) => console.log(i, url))
  await browser.close()
}

main()
