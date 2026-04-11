const fs = require('fs')

// Primero necesitamos guardar el HTML de un producto individual
// Ejecuta esto para ver si tenemos ese archivo
if (!fs.existsSync('producto.html')) {
  console.log('No existe producto.html — necesitamos generarlo')
  console.log('Ejecuta primero: node scraper-debug.js')
} else {
  const html = fs.readFileSync('producto.html', 'utf8')
  const idx = html.indexOf('260.910')
  if (idx > -1) {
    console.log('Precio encontrado:')
    console.log(html.substring(idx - 400, idx + 400))
  } else {
    console.log('Precio 260.910 no encontrado en producto.html')
    const idx2 = html.indexOf('289.900')
    if (idx2 > -1) {
      console.log('Precio normal encontrado:')
      console.log(html.substring(idx2 - 400, idx2 + 400))
    }
  }
}