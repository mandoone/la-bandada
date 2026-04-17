require('dotenv').config()
const { chromium } = require('playwright')
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

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
  console.log(`Semillas: ${semillas.length} subcategorias`)

  const extras = [
    'https://www.dlds.cl/c/grow/carpas',
    'https://www.dlds.cl/c/grow/propagadoras',
  ]

  extras.forEach(u => todas.add(u))
  console.log(`Extras manuales: ${extras.length} subcategorias`)

  return [...todas]
}

function parsearCategoria(url) {
  const path = url.replace('https://www.dlds.cl/c/', '')
  const partes = path.split('/')

  // /c/580/autoxl → semillas/autoxl
  if (partes.length === 2 && !isNaN(partes[0])) {
    return { categoria: 'semillas', subcategoria: partes[1], sub2: null }
  }

  // /c/grow/carpas o /c/grow/propagadoras
  if (partes.length === 2 && partes[0] === 'grow' && ['carpas', 'propagadoras'].includes(partes[1])) {
    return { categoria: 'grow', subcategoria: 'carpas-y-propagadoras', sub2: partes[1] }
  }

  const subcategoriasSemillas = ['automaticas', 'fast', 'feminizadas', 'granel', 'regulares', 'cbd']

  if (partes.length === 1) {
    const segmento = partes[0]

    if (subcategoriasSemillas.includes(segmento)) {
      return { categoria: 'semillas', subcategoria: segmento, sub2: null }
    }

    for (const subcat of subcategoriasSemillas) {
      if (segmento.startsWith(subcat + '-')) {
        const sub2Raw = segmento.slice(subcat.length + 1)
        return { categoria: 'semillas', subcategoria: subcat, sub2: sub2Raw.replace(/-/g, ' ') }
      }
    }
  }

  return {
    categoria: partes[0] || '',
    subcategoria: partes[1] || '',
    sub2: partes[2] || null,
  }
}

async function scrapearPagina(page, url) {
  const URLS_EXCLUIDAS = [
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/innobar',
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/palax',
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/z-bold',
    'https://www.dlds.cl/c/smoke/vapers-y-esencias/oxbar',
    'https://www.dlds.cl/c/grow/herramientas/varios',
    'https://www.dlds.cl/c/smoke/tabaco/tennessee-virginia',
  ]

  if (URLS_EXCLUIDAS.includes(url)) {
    console.log('    URL excluida - categoria rota en DLDS, omitiendo')
    return []
  }

  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  const todosLosLinks = new Set()
  const MAX_PAGINAS = 50
  let numPagina = 1
  let linksKeyAnterior = null
  let top5Anterior = null

  while (numPagina <= MAX_PAGINAS) {
    const linksActuales = await page.$$eval('a[href^="/p/"]', els =>
      [...new Set(els.map(a => a.href))]
    )

    if (numPagina === 1 && linksActuales.length > 20) {
      console.log('    Pagina 1 con mas de 20 productos - redirect a tienda completa, omitiendo')
      return []
    }

    const linksKey = [...linksActuales].sort().join('|')
    if (linksKeyAnterior !== null && linksKey === linksKeyAnterior) {
      console.log(`    -> mismo conjunto completo que anterior - fin`)
      break
    }

    const top5 = linksActuales.slice(0, 5).join('|')
    if (top5Anterior !== null && top5 === top5Anterior) {
      console.log(`    -> primeros 5 links identicos a anterior - fin`)
      break
    }

    linksKeyAnterior = linksKey
    top5Anterior = top5

    const prevSize = todosLosLinks.size
    linksActuales.forEach(l => todosLosLinks.add(l))
    const nuevos = todosLosLinks.size - prevSize
    console.log(`    -> ${nuevos} nuevos (total ${todosLosLinks.size})`)

    if (nuevos === 0) {
      console.log(`    -> 0 links nuevos encontrados en esta pagina - fin de paginacion`)
      break
    }

    const btnSiguiente = await page.$('button.btn.btn-primary:has-text("Siguiente")')
    if (!btnSiguiente) break

    const deshabilitado = await btnSiguiente.evaluate(el =>
      el.disabled || el.classList.contains('opacity-50') || el.hasAttribute('disabled')
    )
    if (deshabilitado) break

    const urlAntesDeClick = page.url()
    try {
      await btnSiguiente.click({ timeout: 5000 })
    } catch (e) {
      console.log(`    -> Boton Siguiente no interactuable (posiblemente nativamente en el DOM) - fin`)
      break
    }

    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    if (page.url() === urlAntesDeClick) {
      console.log(`    -> La URL no cambio tras hacer click - fin de paginacion`)
      break
    }

    numPagina++
  }

  return [...todosLosLinks]
}

async function scrapearProducto(page, url, categoria, subcategoria, sub2, intentos = 3) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await page.goto(url, { timeout: 60000 })
      await page.waitForLoadState('networkidle', { timeout: 60000 })
      await page.waitForTimeout(1500)

      const nombre = await page.$eval('h1', el => el.innerText.trim()).catch(() => null)
      if (!nombre) return { skip_reason: 'error' }

      const stockTexto = await page.$eval('.text-success, .text-error, .text-danger, [class*="stock"]', el =>
        el.innerText.trim()
      ).catch(() => '')
      const enStock = !stockTexto.toLowerCase().includes('sin stock')
      if (!enStock) return { skip_reason: 'sin_stock' }

      const precioNormal = await page.$eval('.text-gray-text.line-through', el =>
        parseInt(el.innerText.replace(/\$|\.|,/g, '').trim())
      ).catch(() => null)

      const precioOferta = await page.$eval('.text-primary.font-bold.text-2xl, .text-primary.font-bold.text-3xl', el =>
        parseInt(el.innerText.replace(/\$|\.|,/g, '').trim())
      ).catch(() => null)

      const descripcion = await page.$eval('[class*="description"], .prose, [class*="desc"]', el =>
        el.innerText.trim()
      ).catch(() => null)

      const imagen = await page.$eval('.product-main-image-container img', el =>
        el.src
      ).catch(() => null)

      const galeria = await page.$$eval('.product-images img, .product-images-container img, .thumbnails img, [class*="thumb"] img', imgs => {
        return [...new Set(imgs.map(i => i.getAttribute('data-image-large-src') || i.src).filter(Boolean))]
      }).catch(() => [])

      const sku = await page.$eval('text=Referencia', el =>
        el.nextElementSibling?.innerText?.trim()
      ).catch(() => null)

      const marca = await page.$eval('text=Marca', el =>
        el.nextElementSibling?.innerText?.trim()
      ).catch(() => null)

      const descuento = precioNormal && precioOferta
        ? Math.round((1 - precioOferta / precioNormal) * 100)
        : null

      return {
        nombre,
        sku,
        marca,
        categoria,
        subcategoria,
        sub2,
        precio_normal: precioNormal,
        precio_neto: precioOferta || precioNormal,
        descuento,
        descripcion,
        imagen_url: imagen,
        producto_url: url,
        stock: 1,
        estado: 'Vigente',
        galeria
      }
    } catch (err) {
      console.log(`  Intento ${intento}/${intentos} fallido: ${err.message.split('\n')[0]}`)
      if (intento < intentos) await page.waitForTimeout(3000)
    }
  }

  console.log(`  Omitido tras ${intentos} intentos: ${url}`)
  return { skip_reason: 'error' }
}

const PROVIDER_DLDS = 1;

async function guardarProducto(producto) {
  const existing = await pool.query(
    'SELECT id FROM products_raw WHERE producto_url = $1',
    [producto.producto_url]
  )

  const esActualizacion = existing.rows.length > 0

  if (esActualizacion) {
    const id = existing.rows[0].id
    await pool.query('DELETE FROM price_history WHERE product_id = $1', [id])
    await pool.query('DELETE FROM stock_history WHERE product_id = $1', [id])
    await pool.query('DELETE FROM products_raw WHERE id = $1', [id])
  }

  await pool.query(
    `INSERT INTO products_raw
      (provider_id, sku, nombre, marca, categoria, subcategoria, sub2, precio_normal, precio_neto,
       descuento, descripcion, imagen_url, producto_url, stock, estado, galeria, indicador)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      PROVIDER_DLDS,
      producto.sku,
      producto.nombre,
      producto.marca,
      producto.categoria,
      producto.subcategoria,
      producto.sub2,
      producto.precio_normal,
      producto.precio_neto,
      producto.descuento,
      producto.descripcion,
      producto.imagen_url,
      producto.producto_url,
      producto.stock,
      producto.estado,
      producto.galeria,
      'vigente'
    ]
  )

  return esActualizacion ? 'actualizado' : 'nuevo'
}

function escaparCsv(valor) {
  const str = String(valor ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

async function obtenerBancosDelSelect(page, url) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  const opciones = await page.$$eval('select.input', selects => {
    const selectMarcas = selects.find(s => {
      const primera = [...s.options].find(o => o.text.trim() !== '')
      return primera?.text.toLowerCase().includes('todas')
    })

    if (!selectMarcas) return []

    return [...selectMarcas.options]
      .map(o => ({ texto: o.text.trim(), valor: o.value.trim() }))
      .filter(o => o.valor !== '' && !o.texto.toLowerCase().includes('todas'))
  }).catch(() => [])

  return opciones
}

async function scrapearPaginaConFiltro(page, catUrl, bancoTexto) {
  await page.goto(catUrl)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  const selectMarcasHandle = await page.evaluateHandle(() => {
    const selects = document.querySelectorAll('select.input')
    return [...selects].find(s => {
      const primera = [...s.options].find(o => o.text.trim() !== '')
      return primera?.text.toLowerCase().includes('todas')
    }) || null
  })

  if (!selectMarcasHandle || !(await selectMarcasHandle.asElement())) {
    console.log(`  [aviso] select de marcas no encontrado para "${bancoTexto}"`)
    return []
  }

  await selectMarcasHandle.selectOption({ label: bancoTexto })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  const todosLosLinks = new Set()
  const MAX_PAGINAS = 50
  let numPagina = 1
  let linksKeyAnterior = null
  let top5Anterior = null

  while (numPagina <= MAX_PAGINAS) {
    const linksActuales = await page.$$eval('a[href^="/p/"]', els =>
      [...new Set(els.map(a => a.href))]
    )

    const linksKey = [...linksActuales].sort().join('|')
    if (linksKeyAnterior !== null && linksKey === linksKeyAnterior) {
      console.log(`    -> mismo conjunto que anterior - fin`)
      break
    }

    const top5 = linksActuales.slice(0, 5).join('|')
    if (top5Anterior !== null && top5 === top5Anterior) {
      console.log(`    -> top-5 identicos - fin`)
      break
    }

    linksKeyAnterior = linksKey
    top5Anterior = top5

    const prevSize = todosLosLinks.size
    linksActuales.forEach(l => todosLosLinks.add(l))
    const nuevos = todosLosLinks.size - prevSize
    console.log(`    -> ${nuevos} nuevos (total ${todosLosLinks.size})`)

    if (nuevos === 0) {
      console.log(`    -> 0 links nuevos encontrados en esta pagina - fin de paginacion`)
      break
    }

    const btnSiguiente = await page.$('button.btn.btn-primary:has-text("Siguiente")')
    if (!btnSiguiente) break

    const deshabilitado = await btnSiguiente.evaluate(el =>
      el.disabled || el.classList.contains('opacity-50') || el.hasAttribute('disabled')
    )
    if (deshabilitado) break

    const urlAntesDeClick = page.url()
    try {
      await btnSiguiente.click({ timeout: 5000 })
    } catch (e) {
      console.log(`    -> Boton Siguiente no interactuable (posiblemente nativamente en el DOM) - fin`)
      break
    }

    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    if (page.url() === urlAntesDeClick) {
      console.log(`    -> La URL no cambio tras hacer click - fin de paginacion`)
      break
    }

    numPagina++
  }

  return [...todosLosLinks]
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  try {
    await login(page)

    console.log('\nDescubriendo categorias...')
    const categorias = await obtenerCategorias(page)
    console.log(`Total categorias a scrapear (Grow + Smoke + Semillas): ${categorias.length}`)

    let totalProductos = 0
    let totalGuardados = 0
    const reporteFilas = []

    const EMPEZAR_DESDE = 0
    const TERMINAR_EN = null // null = correr completo; número = índice base 0 inclusive

    const esCorridaCompleta = (EMPEZAR_DESDE === 0 && TERMINAR_EN === null)
    const limite = TERMINAR_EN !== null ? TERMINAR_EN + 1 : categorias.length

    if (esCorridaCompleta) {
      console.log('\n[SYNC] Iniciando sincronizacion completa. Marcando catalogo DLDS como pendiente_verificacion...');
      await pool.query(`UPDATE products_raw SET indicador = 'pendiente_verificacion' WHERE provider_id = $1`, [PROVIDER_DLDS]);
    }

    for (let ci = EMPEZAR_DESDE; ci < limite; ci++) {
      const catUrl = categorias[ci]
      const parsed = parsearCategoria(catUrl)

      console.log(`\n[${ci + 1}/${categorias.length}] ${parsed.categoria} / ${parsed.subcategoria}${parsed.sub2 ? ' / ' + parsed.sub2 : ''}`)

      const { categoria, subcategoria, sub2: sub2Parseado } = parsed

      let procesadoConBancos = false

      if (categoria === 'semillas' && !sub2Parseado) {
        const bancos = await obtenerBancosDelSelect(page, catUrl)

        if (bancos.length > 0) {
          procesadoConBancos = true
          console.log(`  -> ${bancos.length} bancos detectados: ${bancos.map(b => b.texto).join(', ')}`)

          for (const banco of bancos) {
            const sub2 = banco.texto.toLowerCase()
            console.log(`\n  [banco] ${subcategoria} / ${sub2}`)

            const links = await scrapearPaginaConFiltro(page, catUrl, banco.texto)
            console.log(`  ${links.length} productos encontrados`)
            totalProductos += links.length

            let rachaSinStock = 0;
            let guardadosCategoria = 0;

            for (let i = 0; i < links.length; i++) {
              const producto = await scrapearProducto(page, links[i], categoria, subcategoria, sub2)

              if (producto && !producto.skip_reason) {
                const estado = await guardarProducto(producto)
                totalGuardados++
                guardadosCategoria++
                rachaSinStock = 0
                console.log(`  [OK] [${i + 1}/${links.length}] ${producto.nombre} - $${producto.precio_neto}`)
                reporteFilas.push({ categoria, subcategoria, sub2, url: links[i], nombre: producto.nombre, estado })
              } else {
                const isSinStock = producto?.skip_reason === 'sin_stock'
                if (isSinStock) {
                  rachaSinStock++
                  console.log(`  [NO] [${i + 1}/${links.length}] Sin stock real - omitido`)
                } else {
                  rachaSinStock = 0
                  console.log(`  [NO] [${i + 1}/${links.length}] Error DOM/Red - omitido (Racha reiniciada)`)
                }
                reporteFilas.push({ categoria, subcategoria, sub2, url: links[i], nombre: '', estado: producto?.skip_reason || 'error' })

                if (guardadosCategoria >= 3 && rachaSinStock >= 5) {
                  console.log(`  [!] Cortando categoria: 5 'sin stock' consecutivos despues de exito. Evitando listado muerto.`);
                  break;
                }
              }
            }
          }
        }
      }

      if (!procesadoConBancos) {
        const links = await scrapearPagina(page, catUrl)
        console.log(`  ${links.length} productos encontrados`)
        totalProductos += links.length

        let rachaSinStock = 0;
        let guardadosCategoria = 0;

        for (let i = 0; i < links.length; i++) {
          const producto = await scrapearProducto(page, links[i], categoria, subcategoria, sub2Parseado)

          if (producto && !producto.skip_reason) {
            const estado = await guardarProducto(producto)
            totalGuardados++
            guardadosCategoria++
            rachaSinStock = 0
            console.log(`  [OK] [${i + 1}/${links.length}] ${producto.nombre} - $${producto.precio_neto}`)
            reporteFilas.push({ categoria, subcategoria, sub2: sub2Parseado, url: links[i], nombre: producto.nombre, estado })
          } else {
            const isSinStock = producto?.skip_reason === 'sin_stock'
            if (isSinStock) {
              rachaSinStock++
              console.log(`  [NO] [${i + 1}/${links.length}] Sin stock real - omitido`)
            } else {
              rachaSinStock = 0
              console.log(`  [NO] [${i + 1}/${links.length}] Error DOM/Red - omitido (Racha reiniciada)`)
            }
            reporteFilas.push({ categoria, subcategoria, sub2: sub2Parseado, url: links[i], nombre: '', estado: producto?.skip_reason || 'error' })

            if (guardadosCategoria >= 3 && rachaSinStock >= 5) {
              console.log(`  [!] Cortando categoria: 5 'sin stock' consecutivos despues de exito. Evitando listado muerto.`);
              break;
            }
          }
        }
      }
    }

    console.log('\n=== SCRAPING COMPLETADO ===')
    console.log(`Productos encontrados: ${totalProductos}`)
    console.log(`Productos guardados (con stock): ${totalGuardados}`)
    console.log(`Productos omitidos (sin stock): ${totalProductos - totalGuardados}`)

    if (esCorridaCompleta) {
      console.log('\n[SYNC] Limpiando productos discontinuados en DLDS...');
      const ocultados = await pool.query(`
        UPDATE products_raw 
        SET estado = 'Oculto' 
        WHERE provider_id = $1 AND indicador = 'pendiente_verificacion'
        RETURNING id
      `, [PROVIDER_DLDS]);
      console.log(`[SYNC] ${ocultados.rowCount} productos ya no existen y fueron marcados como Ocultos.`);
    }

    const resVigentes = await pool.query(
      `SELECT COUNT(*) FROM products_raw WHERE provider_id = $1 AND estado = 'Vigente'`,
      [PROVIDER_DLDS]
    );
    const resOcultos = await pool.query(
      `SELECT COUNT(*) FROM products_raw WHERE provider_id = $1 AND estado = 'Oculto'`,
      [PROVIDER_DLDS]
    );
    const vigentesBD = parseInt(resVigentes.rows[0].count, 10);
    const ocultosBD = parseInt(resOcultos.rows[0].count, 10);

    console.log('\n=== ESTADO FINAL BASE DE DATOS LOCAL ===');
    console.log(`- Vigentes con stock finales: ${vigentesBD}`);
    console.log(`- Ocultos finales: ${ocultosBD}`);
    console.log(`- Total sincronizable a Neon: ${vigentesBD + ocultosBD}\n`);

    const cabecera = 'categoria,subcategoria,sub2,url,nombre,estado'
    const filas = reporteFilas.map(r =>
      [r.categoria, r.subcategoria, r.sub2, r.url, r.nombre, r.estado].map(escaparCsv).join(',')
    )

    const csv = [cabecera, ...filas].join('\n')
    const csvPath = path.join(__dirname, 'reporte-scraping.csv')
    fs.writeFileSync(csvPath, csv, 'utf8')
    console.log(`Reporte exportado: ${csvPath}`)
  } catch (err) {
    console.error('Error general:', err.message)
    await page.screenshot({ path: 'error.png' })
  } finally {
    await browser.close()
    await pool.end()
  }
}

main()