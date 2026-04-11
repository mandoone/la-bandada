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

async function importar() {
  const workbook = XLSX.readFile('stock-dlds.xlsx')
  const hoja = workbook.Sheets[workbook.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 })

  const productos = filas.slice(2).filter(f => f[0])

  console.log(`Importando ${productos.length} productos...`)

  for (const fila of productos) {
    await pool.query(
      `INSERT INTO products_raw 
        (provider_id, sku, nombre, stock, indicador, cobertura_meses, estado, precio_neto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [1, fila[0], fila[1], fila[2], fila[3], fila[4], fila[5], fila[6]]
    )
  }

  console.log('Importación completada.')
  await pool.end()
}

importar()