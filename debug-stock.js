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

  await page.goto('https://www.dlds.cl/p/12665/rktr-240-recarga-co2-reaktor')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)

  // Buscar cualquier texto que contenga "stock"
  const textos = await page.$$eval('*', els =>
    els
      .filter(el => el.children.length === 0 && el.innerText?.toLowerCase().includes('stock'))
      .map(el => ({ tag: el.tagName, clase: el.className, texto: el.innerText.trim() }))
  )
  console.log('Textos con "stock":')
  textos.forEach(t => console.log(t))

  await browser.close()
}

main()