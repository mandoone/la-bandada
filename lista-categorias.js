require('dotenv').config()
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

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
    console.log(`${seccion}: ${links.length} subcategorias`)
  }

  const semillas = [
    'https://www.dlds.cl/c/automaticas',
    'https://www.dlds.cl/c/580/autoxl',
    'https://www.dlds.cl/c/fast',
    'https://www.dlds.cl/c/feminizadas',
    'https://www.dlds.cl/c/granel',
    'https://www.dlds.cl/c/regulares',
    'https://www.dlds.cl/c/cbd',
  ]
  semillas.forEach(u => todas.add(u))
  console.log(`Semillas: ${semillas.length} subcategorias añadidos`)

  const extras = [
    'https://www.dlds.cl/c/grow/carpas',
    'https://www.dlds.cl/c/grow/propagadoras',
  ]
  extras.forEach(u => todas.add(u))
  console.log(`Extras manuales: ${extras.length} subcategorias añadidas`)

  const arr = [...todas]
  console.log(`\nTotal final recolectado: ${arr.length} categorías únicas.\n`)

  const reportePath = path.join(__dirname, 'lista_categorias_referencia.txt')
  const lineasReporte = arr.map((url, i) => `${i.toString().padStart(3, '0')} - ${url}`)
  
  lineasReporte.forEach(l => console.log(l))
  
  fs.writeFileSync(reportePath, lineasReporte.join('\n'), 'utf8')
  console.log(`\nReporte guardado exitosamente en: ${reportePath}`)

  await browser.close()
}

main()
