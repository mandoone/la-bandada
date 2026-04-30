require('dotenv').config()
const { Pool } = require('pg')

const local = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const neon = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_wlR0VcQveyL7@ep-damp-field-acqi7ofx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
})

const MINIMO_URLS_PARA_STALE_CLEANUP = 2000

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (Number.isNaN(n)) return null
  return Math.round(n)
}

async function migrar() {
  console.log('Iniciando migración a Neon...')

  const productos = await local.query(`
    SELECT * FROM products_raw
    WHERE producto_url IS NOT NULL
    ORDER BY id
  `)
  console.log(`${productos.rows.length} productos a migrar`)

  let migrados = 0
  const urlsMigradas = []

  for (const p of productos.rows) {
    await neon.query(`
      INSERT INTO products_raw
        (provider_id, sku, nombre, marca, categoria, subcategoria, sub2,
         precio_normal, precio_neto, descuento, descripcion,
         imagen_url, producto_url, stock, estado, indicador,
         cobertura_meses, fecha_captura, galeria)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (producto_url) DO UPDATE SET
        sku          = EXCLUDED.sku,
        nombre       = EXCLUDED.nombre,
        marca        = EXCLUDED.marca,
        categoria    = EXCLUDED.categoria,
        subcategoria = EXCLUDED.subcategoria,
        sub2         = EXCLUDED.sub2,
        precio_normal = EXCLUDED.precio_normal,
        precio_neto  = EXCLUDED.precio_neto,
        descuento    = EXCLUDED.descuento,
        descripcion  = EXCLUDED.descripcion,
        imagen_url   = EXCLUDED.imagen_url,
        stock        = EXCLUDED.stock,
        estado       = EXCLUDED.estado,
        indicador    = EXCLUDED.indicador,
        cobertura_meses = EXCLUDED.cobertura_meses,
        fecha_captura = EXCLUDED.fecha_captura,
        galeria      = EXCLUDED.galeria
    `, [
      toIntOrNull(p.provider_id), p.sku, p.nombre, p.marca, p.categoria, p.subcategoria, p.sub2,
      toIntOrNull(p.precio_normal), toIntOrNull(p.precio_neto), toIntOrNull(p.descuento), p.descripcion,
      p.imagen_url, p.producto_url, toIntOrNull(p.stock), p.estado, p.indicador,
      toIntOrNull(p.cobertura_meses), p.fecha_captura, p.galeria
    ])
    urlsMigradas.push(p.producto_url)
    migrados++
    if (migrados % 100 === 0) console.log(`  ${migrados}/${productos.rows.length} migrados...`)
  }

  console.log(`Migración completada: ${migrados} productos en Neon`)
  console.log(`Total URLs migradas en esta corrida: ${urlsMigradas.length}`)

  // Stale cleanup: ocultar en Neon productos Vigentes que ya no existen en local
  if (urlsMigradas.length < MINIMO_URLS_PARA_STALE_CLEANUP) {
    console.warn(
      `⚠️  Limpieza stale omitida: cantidad de URLs migradas sospechosamente baja ` +
      `(${urlsMigradas.length} < ${MINIMO_URLS_PARA_STALE_CLEANUP})`
    )
  } else {
    const staleResult = await neon.query(`
      UPDATE products_raw
      SET
        estado    = 'Oculto',
        stock     = 0,
        indicador = 'oculto_stale_neon'
      WHERE provider_id = 1
        AND producto_url IS NOT NULL
        AND estado = 'Vigente'
        AND NOT (producto_url = ANY($1::text[]))
    `, [urlsMigradas])

    const ocultados = staleResult.rowCount
    if (ocultados > 0) {
      console.log(`Stale cleanup: ${ocultados} productos ocultados en Neon (estaban Vigentes pero ya no existen en local)`)
    } else {
      console.log('Stale cleanup: sin productos stale detectados, Neon está sincronizado')
    }
  }

  await local.end()
  await neon.end()
}

migrar()