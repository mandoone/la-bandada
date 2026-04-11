require('dotenv').config()
const XLSX = require('xlsx')
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const MARGEN = 0.30

async function actualizar() {
  try {
    console.log('=== INICIO ACTUALIZACIÓN ===')
    console.log(new Date().toLocaleString())
    console.log('---')

    console.log('Leyendo Excel...')
    const workbook = XLSX.readFile('stock-dlds.xlsx')
    const hoja = workbook.Sheets[workbook.SheetNames[0]]
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 })
    const productos = filas.slice(2).filter(f => f[0])
    console.log(`${productos.length} productos encontrados en Excel`)

    console.log('Limpiando datos anteriores...')
    await pool.query('DELETE FROM price_history')
    await pool.query('DELETE FROM stock_history')
    await pool.query('DELETE FROM products_raw')

    console.log('Insertando productos actualizados...')
    for (const fila of productos) {
      const result = await pool.query(
        `INSERT INTO products_raw
          (provider_id, sku, nombre, stock, indicador, cobertura_meses, estado, precio_neto)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [1, fila[0], fila[1], fila[2], fila[3], fila[4], fila[5], fila[6]]
      )
      const productId = result.rows[0].id
      const precioVenta = Math.ceil(fila[6] * (1 + MARGEN))
      await pool.query(
        'INSERT INTO price_history (product_id, precio) VALUES ($1,$2)',
        [productId, precioVenta]
      )
      await pool.query(
        'INSERT INTO stock_history (product_id, stock) VALUES ($1,$2)',
        [productId, fila[2]]
      )
    }

    console.log('---')
    console.log(`Completado: ${productos.length} productos procesados`)
    console.log('=== FIN ACTUALIZACIÓN ===')
  } catch (err) {
    console.error('Error:', err.message)
  } finally {
    await pool.end()
  }
}

actualizar()