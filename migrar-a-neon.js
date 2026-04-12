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

async function migrar() {
  console.log('Iniciando migración a Neon...')

  const productos = await local.query(`
    SELECT * FROM products_raw
    WHERE producto_url IS NOT NULL
    ORDER BY id
  `)
  console.log(`${productos.rows.length} productos a migrar`)

  let migrados = 0
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
      p.provider_id, p.sku, p.nombre, p.marca, p.categoria, p.subcategoria, p.sub2,
      p.precio_normal, p.precio_neto, p.descuento, p.descripcion,
      p.imagen_url, p.producto_url, p.stock, p.estado, p.indicador,
      p.cobertura_meses, p.fecha_captura, p.galeria
    ])
    migrados++
    if (migrados % 100 === 0) console.log(`  ${migrados}/${productos.rows.length} migrados...`)
  }

  console.log(`Migración completada: ${migrados} productos en Neon`)
  await local.end()
  await neon.end()
}

migrar()