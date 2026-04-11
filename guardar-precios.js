require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const MARGEN = 0.30

async function guardarPrecios() {
  const result = await pool.query(
    `SELECT id, precio_neto FROM products_raw WHERE precio_neto IS NOT NULL`
  )

  console.log(`Guardando precios de ${result.rows.length} productos...`)

  for (const p of result.rows) {
    const precioVenta = Math.ceil(p.precio_neto * (1 + MARGEN))
    await pool.query(
      `INSERT INTO price_history (product_id, precio) VALUES ($1, $2)`,
      [p.id, precioVenta]
    )
  }

  console.log('Precios guardados en historial.')
  await pool.end()
}

guardarPrecios()