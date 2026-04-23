# La Bandada Growshop — Contexto del Proyecto

## Objetivo
Tienda online automatizada basada en scraping de proveedores, con base de datos propia y control total del catálogo, independiente del proveedor en tiempo real.

## Stack actual
- Frontend: Next.js 16 + Tailwind CSS
- Scraper: Node.js + Playwright
- Base de datos local de scraping: PostgreSQL en VPS Ubuntu
- Base de datos producción: Neon PostgreSQL
- Hosting web: Vercel
- Infraestructura scraping: Oracle Cloud Free Tier VPS
- Entorno de trabajo local: Windows + Antigravity + VS Code

## Arquitectura actual

Proveedor DLDS
→ Scraper Playwright en VPS Oracle
→ PostgreSQL local en VPS (`labandada_stock`)
→ Script de migración (`migrar-a-neon.js`)
→ Neon PostgreSQL
→ Web pública Next.js en Vercel

## Estado actual real

### Web
- Web operativa en producción
- Dominio configurado
- Catálogo navegable
- Filtros por categoría, subcategoría y sub2
- Panel /admin funcional
- Productos ocultos no visibles en vitrina

### Scraper
- Descubrimiento automático de categorías
- Grow + Smoke + Semillas + extras manuales
- Soporte completo de `categoria`, `subcategoria`, `sub2`
- Paginación corregida
- Corte inteligente por racha sin stock
- Exportación de `reporte-scraping.csv`
- Sincronización inteligente:
  - inicio corrida completa → `pendiente_verificacion`
  - detectado en scraping → `Vigente`
  - no detectado al final → `Oculto`
- Ejecuta correctamente en Linux VPS con Playwright en modo `headless: true`

### Base de datos local en VPS
- PostgreSQL instalado y operativo en Oracle Cloud
- Base: `labandada_stock`
- Tablas activas:
  - `providers`
  - `products_raw`
  - `price_history`
  - `stock_history`
  - `margin_rules`

### Última corrida válida en VPS
- Productos encontrados: 4056
- Productos guardados con stock durante el scraping: 2376
- Productos omitidos por sin stock: 1680
- Vigentes finales: 2239
- Ocultos finales: 342
- Total sincronizable a Neon: 2581

### Producción / Neon
- `migrar-a-neon.js` ya funciona desde el VPS
- Migración validada con 2581 productos
- Flujo local VPS → Neon operativo

## Infraestructura VPS Oracle
- Proveedor: Oracle Cloud Free Tier
- Sistema operativo: Ubuntu 22.04
- Acceso por SSH operativo
- Node.js instalado con `nvm`
- Playwright instalado con dependencias Linux
- PostgreSQL local instalado
- Zona horaria del VPS:
  - `America/Santiago`

## Automatización
La automatización ya quedó implementada en el VPS.

### Script principal
`/home/ubuntu/la-bandada/run-scraper.sh`

### Flujo automático
1. Ejecuta `scraper-dlds.js`
2. Ejecuta `migrar-a-neon.js`
3. Registra salida en:
   - `~/la-bandada/logs/cron-scraper.log`

### Programación
Cron configurado en el VPS:

`0 3 * * * flock -n /tmp/la-bandada-scraper.lock /home/ubuntu/la-bandada/run-scraper.sh`

Esto significa:
- corre todos los días a las 03:00
- no depende del PC local
- tiene bloqueo anti-solape para no correr dos veces al mismo tiempo

## Archivos importantes del scraper
- `scraper-dlds.js`
- `migrar-a-neon.js`
- `run-scraper.sh`
- `reporte-scraping.csv`
- `logs/cron-scraper.log`

## Cambios importantes realizados en esta etapa
- Migración del scraping desde PC Windows a VPS Oracle
- Instalación completa de entorno Linux
- Adaptación del scraper a ejecución headless
- Creación de BD local en VPS
- Corrección de migración a Neon para tipos numéricos
- Configuración de cron diario con lock

## Situación actual del proyecto
La prioridad histórica del proyecto era automatizar el scraper para dejar de depender del PC encendido. Esa etapa ya quedó resuelta.

El sistema ahora tiene:
- web operativa
- catálogo sincronizable
- scraping funcionando en servidor
- cron activo
- migración a producción funcionando

## Criterio operativo actual
Las modificaciones del scraper y automatización deben hacerse en esta carpeta correcta del proyecto:

`C:\Users\Coope\Dropbox\LA BANDADA\2026\GROWSHOP\LABANDADA WEB\CARPETAS DEL PROEYCTO WEB\la-bandada`

La carpeta vieja `C:\Users\Coope\la-bandada` debe considerarse legado y no seguir usándose para cambios nuevos.

## Próxima prioridad recomendada
Cerrar la automatización con observabilidad mínima:
- verificar la primera corrida automática por cron
- dejar indicador simple de última corrida exitosa/fallida
- preparar base para ver estado desde panel admin o desde archivo de estado