require('dotenv').config()
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  // Login
  await page.goto('https://www.dlds.cl/login')
  await page.waitForLoadState('networkidle')
  await page.fill('input[type="email"]', process.env.DLDS_EMAIL)
  await page.fill('input[type="password"]', process.env.DLDS_PASSWORD)
  await page.click('button:has-text("Iniciar Sesión")')
  await page.waitForURL('https://www.dlds.cl/')
  console.log('Login OK\n')

  // Ir a una categoría con varios productos
  await page.goto('https://www.dlds.cl/c/grow/herramientas')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 1. Contar links de productos en esta página
  const links = await page.$$eval('a[href^="/p/"]', els => [...new Set(els.map(a => a.href))])
  console.log(`Links /p/ encontrados: ${links.length}`)
  console.log('Primeros 3:', links.slice(0, 3))

  // 2. Buscar cualquier elemento que contenga texto de paginación
  const textosPaginacion = await page.$$eval('*', els =>
    els
      .filter(el => {
        const t = el.innerText?.trim()
        return t && (t === 'Siguiente' || t === '>' || t === '→' || t === 'Next' || /^\d+$/.test(t))
          && el.children.length === 0
      })
      .map(el => ({
        tag: el.tagName,
        text: el.innerText.trim(),
        class: el.className,
        href: el.href || null,
        role: el.getAttribute('aria-label') || null,
      }))
      .slice(0, 20)
  ).catch(() => [])
  console.log('\nElementos con texto de paginación:', JSON.stringify(textosPaginacion, null, 2))

  // 3. Buscar elementos con clases que sugieran paginación
  const clasesPaginacion = await page.$$eval('*', els =>
    els
      .filter(el => /pagina|pagination|page|next|prev/i.test(el.className))
      .map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.innerText?.slice(0, 80).trim(),
        href: el.href || null,
      }))
      .slice(0, 20)
  ).catch(() => [])
  console.log('\nElementos con clase de paginación:', JSON.stringify(clasesPaginacion, null, 2))

  // 4. Buscar botones/links con aria-label
  const ariaElements = await page.$$eval('[aria-label]', els =>
    els.map(el => ({
      tag: el.tagName,
      ariaLabel: el.getAttribute('aria-label'),
      class: el.className,
      href: el.href || null,
    }))
  ).catch(() => [])
  console.log('\nElementos con aria-label:', JSON.stringify(ariaElements, null, 2))

  // 5. Buscar SVG o botones al final de la lista de productos
  const botonesFinLista = await page.$$eval('button, a', els =>
    els
      .filter(el => {
        const t = el.innerText?.trim().toLowerCase()
        return t && (t.includes('siguiente') || t.includes('more') || t.includes('cargar') || t.includes('ver más'))
      })
      .map(el => ({
        tag: el.tagName,
        text: el.innerText.trim(),
        class: el.className,
        href: el.href || null,
      }))
  ).catch(() => [])
  console.log('\nBotones "siguiente/cargar más":', JSON.stringify(botonesFinLista, null, 2))

  await browser.close()
}

main().catch(console.error)
