require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const MARGEN = 0.30 // 30% de margen por defecto

async function calcularPrecios() {
  const result = await pool.query(
    `SELECT id, sku, nombre, precio_neto FROM products_raw LIMIT 10`
  )

  console.log('Precio proveedor → Tu precio de venta:')
  console.log('---')

  for (const p of result.rows) {
    const precioVenta = Math.ceil(p.precio_neto * (1 + MARGEN))
    console.log({
      sku: p.sku,
      nombre: p.nombre.substring(0, 40),
      precio_proveedor: p.precio_neto,
      precio_venta: precioVenta,
      margen: '30%'
    })
  }

  await pool.end()
}

calcularPrecios()