require('dotenv').config()
const { chromium } = require('playwright')
const fs = require('fs')

async function login(page) {
  await page.goto('https://www.dlds.cl/login')
  await page.waitForLoadState('networkidle')
  await page.fill('input[type="email"]', process.env.DLDS_EMAIL)
  await page.fill('input[type="password"]', process.env.DLDS_PASSWORD)
  await page.click('button:has-text("Iniciar Sesión")')
  await page.waitForURL('https://www.dlds.cl/')
  console.log('Login exitoso')
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  try {
    await login(page)

    const url = 'https://www.dlds.cl/c/automaticas'
    console.log(`\nCargando ${url}...`)
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // esperar JS dinámico

    // Volcar HTML completo
    const html = await page.content()
    fs.writeFileSync('debug-automaticas.html', html, 'utf8')
    console.log(`HTML guardado en debug-automaticas.html (${html.length} chars)`)

    // Buscar posibles selectores de filtro
    const selectores = [
      '[class*="filter"]',
      '[class*="marca"]',
      '[class*="bank"]',
      '[class*="brand"]',
      '[class*="chip"]',
      '[class*="tag"]',
      '[class*="pill"]',
      '[class*="badge"]',
      'button[class*="filter"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'select',
      '[data-filter]',
      '[data-marca]',
      '[data-brand]',
    ]

    console.log('\n=== Buscando elementos de filtro ===')
    for (const sel of selectores) {
      const count = await page.$$eval(sel, els => els.length).catch(() => 0)
      if (count > 0) {
        console.log(`\n[${count} encontrados] ${sel}`)
        const textos = await page.$$eval(sel, els =>
          els.slice(0, 10).map(el => ({
            tag: el.tagName,
            class: el.className?.slice(0, 80),
            text: el.innerText?.trim().slice(0, 60),
            href: el.href || null,
            value: el.value || null,
          }))
        ).catch(() => [])
        textos.forEach(t => console.log('  ', JSON.stringify(t)))
      }
    }

    // Buscar todos los textos que contengan "fast" o "barneys" o "bsf" (nombres de bancos conocidos)
    console.log('\n=== Buscando texto de bancos conocidos ===')
    const bancosConocidos = ['fast buds', 'barneys', 'bsf', 'dutch', 'positronic', 'kannabia', 'philosopher', 'humboldt', 'dinafem']
    for (const banco of bancosConocidos) {
      const encontrado = await page.$$eval('*', (els, b) =>
        els.filter(el => el.children.length === 0 && el.innerText?.toLowerCase().includes(b))
          .slice(0, 3)
          .map(el => ({ tag: el.tagName, class: el.className?.slice(0, 60), text: el.innerText?.trim().slice(0, 80) })),
        banco
      ).catch(() => [])
      if (encontrado.length > 0) {
        console.log(`\n  "${banco}" encontrado en:`)
        encontrado.forEach(e => console.log('   ', JSON.stringify(e)))
      }
    }

  } catch (err) {
    console.error('Error:', err.message)
    await page.screenshot({ path: 'debug-error.png' })
  } finally {
    await browser.close()
  }
}

main()
