require('dotenv').config()
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

async function login(page) {
  await page.goto('https://www.dlds.cl/login')
  await page.waitForLoadState('networkidle')
  await page.fill('input[type="email"]', process.env.DLDS_EMAIL)
  await page.fill('input[type="password"]', process.env.DLDS_PASSWORD)
  await page.click('button:has-text("Iniciar Sesión")')
  await page.waitForURL('https://www.dlds.cl/')
  console.log('Login exitoso')
}

async function obtenerCategorias(page) {
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
      [...new Set(els.map(a => a.href))]
        .filter(h => {
          const partes = h.replace('https://www.dlds.cl/c/', '').split('/')
          return partes.length === 3
        })
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

  return [...todas]
}

function parsearCategoria(url) {
  const path = url.replace('https://www.dlds.cl/c/', '')
  const partes = path.split('/')

  if (partes.length === 2 && !isNaN(partes[0])) {
    return { categoria: 'semillas', subcategoria: partes[1] }
  }

  const subcategoriasSemillas = ['automaticas', 'fast', 'feminizadas', 'granel', 'regulares', 'cbd']
  if (partes.length === 1 && subcategoriasSemillas.includes(partes[0])) {
    return { categoria: 'semillas', subcategoria: partes[0] }
  }

  return {
    categoria: partes[0] || '',
    subcategoria: partes[1] || '',
  }
}

async function auditarCategoria(page, url) {
  const URLS_EXCLUIDAS = [
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/innobar',
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/palax',
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/z-bold',
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/oxbar',
  ]

  if (URLS_EXCLUIDAS.includes(url)) {
    console.log('    URL excluida — omitiendo')
    return { total_productos: 0, con_stock: 0, paginas_recorridas: 0 }
  }

  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  const MAX_PAGINAS = 50
  let numPagina = 1
  let linksKeyAnterior = null
  let top5Anterior = null

  const todosLosLinks = new Set()
  let conStock = 0

  while (numPagina <= MAX_PAGINAS) {
    // Obtener todos los links de productos en esta página
    const linksActuales = await page.$$eval('a[href^="/p/"]', els =>
      [...new Set(els.map(a => a.href))]
    )

    if (numPagina === 1 && linksActuales.length > 20) {
      console.log('    Página 1 con más de 20 productos — redirect a tienda completa, omitiendo')
      return { total_productos: 0, con_stock: 0, paginas_recorridas: 0 }
    }

    // Detección de loop: mismo conjunto completo
    const linksKey = [...linksActuales].sort().join('|')
    if (linksKeyAnterior !== null && linksKey === linksKeyAnterior) {
      console.log(`    → mismo conjunto que anterior — fin en página ${numPagina - 1}`)
      break
    }

    // Detección de loop: primeros 5 iguales
    const top5 = linksActuales.slice(0, 5).join('|')
    if (top5Anterior !== null && top5 === top5Anterior) {
      console.log(`    → top-5 idénticos — fin en página ${numPagina - 1}`)
      break
    }

    linksKeyAnterior = linksKey
    top5Anterior = top5

    // Contar nuevos productos y verificar stock en esta página
    const linksNuevos = linksActuales.filter(l => !todosLosLinks.has(l))
    linksNuevos.forEach(l => todosLosLinks.add(l))

    // Contar productos con stock: cards que NO tienen .text-error visible
    // Los productos sin stock muestran texto con clase .text-error
    const productCards = await page.$$('a[href^="/p/"]')
    for (const card of productCards) {
      const href = await card.getAttribute('href')
      const fullUrl = `https://www.dlds.cl${href}`
      if (!linksNuevos.includes(fullUrl)) continue

      // Buscar indicador de sin stock dentro o cerca del card
      const sinStock = await card.evaluate(el => {
        // Buscar en el elemento padre (tarjeta de producto)
        const parent = el.closest('li, article, div[class*="product"], div[class*="card"]') || el.parentElement
        if (!parent) return false
        const errorEl = parent.querySelector('.text-error, .text-danger, [class*="sin-stock"], [class*="sinstock"]')
        if (errorEl) {
          const texto = errorEl.innerText?.toLowerCase() || ''
          return texto.includes('sin stock') || texto.includes('agotado')
        }
        return false
      })

      if (!sinStock) conStock++
    }

    console.log(`    Página ${numPagina}: ${linksNuevos.length} nuevos (total ${todosLosLinks.size}, con stock ~${conStock})`)

    // Botón siguiente
    const btnSiguiente = await page.$('button.btn.btn-primary:has-text("Siguiente")')
    if (!btnSiguiente) break

    const deshabilitado = await btnSiguiente.evaluate(el =>
      el.disabled || el.classList.contains('opacity-50') || el.hasAttribute('disabled')
    )
    if (deshabilitado) break

    await btnSiguiente.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    numPagina++
  }

  return {
    total_productos: todosLosLinks.size,
    con_stock: conStock,
    paginas_recorridas: numPagina > MAX_PAGINAS ? MAX_PAGINAS : numPagina,
  }
}

function escaparCsv(valor) {
  const str = String(valor ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  const resultados = []

  try {
    await login(page)

    console.log('\nDescubriendo categorías...')
    const categorias = await obtenerCategorias(page)
    console.log(`Total URLs a auditar: ${categorias.length}\n`)

    for (let i = 0; i < categorias.length; i++) {
      const url = categorias[i]
      const { categoria, subcategoria } = parsearCategoria(url)
      console.log(`[${i + 1}/${categorias.length}] ${categoria} / ${subcategoria}`)

      const { total_productos, con_stock, paginas_recorridas } = await auditarCategoria(page, url)

      resultados.push({ numero: i + 1, categoria, subcategoria, url, total_productos, con_stock, paginas_recorridas })
      console.log(`  → total: ${total_productos}, con stock: ${con_stock}, páginas: ${paginas_recorridas}`)
    }

  } catch (err) {
    console.error('Error general:', err.message)
    await page.screenshot({ path: 'auditoria-error.png' })
  } finally {
    await browser.close()
  }

  // Exportar CSV
  const cabecera = 'numero,categoria,subcategoria,url,total_productos,con_stock,paginas_recorridas'
  const filas = resultados.map(r =>
    [r.numero, r.categoria, r.subcategoria, r.url, r.total_productos, r.con_stock, r.paginas_recorridas]
      .map(escaparCsv)
      .join(',')
  )
  const csv = [cabecera, ...filas].join('\n')

  const outputPath = path.join(__dirname, 'auditoria-categorias.csv')
  fs.writeFileSync(outputPath, csv, 'utf8')

  console.log(`\n=== AUDITORÍA COMPLETA ===`)
  console.log(`Categorías auditadas: ${resultados.length}`)
  console.log(`Total productos encontrados: ${resultados.reduce((s, r) => s + r.total_productos, 0)}`)
  console.log(`Total con stock: ${resultados.reduce((s, r) => s + r.con_stock, 0)}`)
  console.log(`CSV exportado: ${outputPath}`)
}

main()
