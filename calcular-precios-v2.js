require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const MARGEN_DEFAULT = 30.00

async function calcularPrecios() {
  console.log('Calculando precios con margin_rules...')

  const productos = await pool.query(`
    SELECT p.id, p.nombre, p.categoria, p.subcategoria, p.precio_neto,
           m.margen
    FROM products_raw p
    LEFT JOIN margin_rules m
      ON LOWER(p.categoria) = LOWER(m.categoria)
      AND LOWER(p.subcategoria) = LOWER(m.subcategoria)
    WHERE p.precio_neto IS NOT NULL
      AND p.producto_url IS NOT NULL
  `)

  console.log(`${productos.rows.length} productos a procesar`)

  await pool.query('DELETE FROM price_history')

  for (const p of productos.rows) {
    const margen = p.margen ? parseFloat(p.margen) : MARGEN_DEFAULT
    const precioVenta = Math.ceil(p.precio_neto * (1 + margen / 100))

    await pool.query(
      'INSERT INTO price_history (product_id, precio) VALUES ($1, $2)',
      [p.id, precioVenta]
    )
  }

  console.log('Precios calculados y guardados en price_history.')
  console.log(`Margen default usado cuando no hay regla: ${MARGEN_DEFAULT}%`)
  await pool.end()
}

calcularPrecios()