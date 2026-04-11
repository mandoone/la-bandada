const { chromium } = require('playwright')

async function testLogin() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  console.log('Abriendo DLDS...')
  await page.goto('https://www.dlds.cl/')

  console.log('Buscando botón de login...')
  await page.click('text=Omar Quezada')
  await page.waitForTimeout(2000)

  console.log('URL actual:', page.url())
  await browser.close()
}

testLogin()