const XLSX = require('xlsx')

const workbook = XLSX.readFile('stock-dlds.xlsx')
const hoja = workbook.Sheets[workbook.SheetNames[0]]
const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 })

const encabezados = filas[1]
console.log('Columnas encontradas:', encabezados)
console.log('---')

console.log('Primeros 5 productos:')
for (let i = 2; i < 7; i++) {
  const fila = filas[i]
  console.log({
    sku:       fila[0],
    nombre:    fila[1],
    stock:     fila[2],
    indicador: fila[3],
    cobertura: fila[4],
    estado:    fila[5],
    precio:    fila[6]
  })
}