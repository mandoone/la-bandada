require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const statusFilePath = path.join(__dirname, 'logs', 'last-run-status.json');

async function actualizarEstadoProductos(neon, productos, runId) {
  for (let i = 0; i < productos.length; i += 500) {
    const lote = productos.slice(i, i + 500);
    const values = [];
    const placeholders = lote.map((producto, index) => {
      const offset = index * 9;
      values.push(
        producto.producto_url,
        producto.provider_id,
        producto.nombre,
        producto.estado,
        producto.categoria,
        producto.subcategoria,
        producto.sub2,
        producto.precio_neto,
        runId
      );
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},NOW())`;
    }).join(',');

    await neon.query(`
      INSERT INTO scraper_product_state (
        producto_url, provider_id, nombre, estado,
        categoria, subcategoria, sub2, precio_neto,
        last_seen_run_id, updated_at
      ) VALUES ${placeholders}
      ON CONFLICT (producto_url) DO UPDATE SET
        provider_id = EXCLUDED.provider_id,
        nombre = EXCLUDED.nombre,
        estado = EXCLUDED.estado,
        categoria = EXCLUDED.categoria,
        subcategoria = EXCLUDED.subcategoria,
        sub2 = EXCLUDED.sub2,
        precio_neto = EXCLUDED.precio_neto,
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        updated_at = NOW();
    `, values);
  }
}

async function registrarCambiosProductos(neon, runId) {
  await neon.query(`
    CREATE TABLE IF NOT EXISTS scraper_product_state (
      producto_url TEXT PRIMARY KEY,
      provider_id INTEGER,
      nombre TEXT,
      estado TEXT,
      categoria TEXT,
      subcategoria TEXT,
      sub2 TEXT,
      precio_neto INTEGER,
      last_seen_run_id INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await neon.query(`
    CREATE TABLE IF NOT EXISTS scraper_product_changes (
      id SERIAL PRIMARY KEY,
      run_id INTEGER,
      tipo_cambio TEXT NOT NULL,
      producto_url TEXT,
      provider_id INTEGER,
      nombre TEXT,
      categoria TEXT,
      subcategoria TEXT,
      sub2 TEXT,
      precio_neto INTEGER,
      estado_anterior TEXT,
      estado_actual TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const productosActuales = await neon.query(`
    SELECT
      producto_url, provider_id, nombre, estado,
      categoria, subcategoria, sub2, precio_neto
    FROM products_raw
    WHERE provider_id = 1
      AND producto_url IS NOT NULL;
  `);

  const stateCount = await neon.query('SELECT COUNT(*)::INTEGER AS total FROM scraper_product_state;');
  const esBaselineInicial = stateCount.rows[0].total === 0;

  if (esBaselineInicial) {
    await actualizarEstadoProductos(neon, productosActuales.rows, runId);
    console.log('Baseline inicial creada, sin cambios registrados');
    return;
  }

  const estadoAnterior = await neon.query(`
    SELECT producto_url, estado
    FROM scraper_product_state;
  `);
  const estadosPorUrl = new Map(estadoAnterior.rows.map((p) => [p.producto_url, p.estado]));

  const cambios = [];
  for (const producto of productosActuales.rows) {
    const estadoPrevio = estadosPorUrl.get(producto.producto_url);
    const estadoActual = producto.estado;

    let tipoCambio = null;
    if (!estadoPrevio && estadoActual === 'Vigente') {
      tipoCambio = 'nuevo';
    } else if (estadoPrevio === 'Vigente' && estadoActual === 'Oculto') {
      tipoCambio = 'ocultado';
    } else if (estadoPrevio === 'Oculto' && estadoActual === 'Vigente') {
      tipoCambio = 'reactivado';
    }

    if (tipoCambio) {
      cambios.push({ ...producto, tipo_cambio: tipoCambio, estado_anterior: estadoPrevio || null });
    }
  }

  for (let i = 0; i < cambios.length; i += 500) {
    const lote = cambios.slice(i, i + 500);
    const values = [];
    const placeholders = lote.map((cambio, index) => {
      const offset = index * 11;
      values.push(
        runId,
        cambio.tipo_cambio,
        cambio.producto_url,
        cambio.provider_id,
        cambio.nombre,
        cambio.categoria,
        cambio.subcategoria,
        cambio.sub2,
        cambio.precio_neto,
        cambio.estado_anterior,
        cambio.estado
      );
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`;
    }).join(',');

    await neon.query(`
      INSERT INTO scraper_product_changes (
        run_id, tipo_cambio, producto_url, provider_id, nombre,
        categoria, subcategoria, sub2, precio_neto,
        estado_anterior, estado_actual
      ) VALUES ${placeholders};
    `, values);
  }

  await actualizarEstadoProductos(neon, productosActuales.rows, runId);
  console.log(`Trazabilidad registrada: ${cambios.length} cambios de productos.`);
}

async function registrarRun() {
  console.log('Iniciando registro de ejecución del scraper en Neon...');

  if (!process.env.NEON_DATABASE_URL) {
    console.error('Error: La variable de entorno NEON_DATABASE_URL no está definida.');
    process.exit(1);
  }

  if (!fs.existsSync(statusFilePath)) {
    console.error(`Error: No se encontró el archivo de estado en ${statusFilePath}`);
    process.exit(1);
  }

  let rawJsonText;
  let statusData;
  try {
    rawJsonText = fs.readFileSync(statusFilePath, 'utf8');
    statusData = JSON.parse(rawJsonText);
  } catch (err) {
    console.error('Error al leer o parsear last-run-status.json:', err.message);
    process.exit(1);
  }

  const neon = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Crear tabla si no existe
    await neon.query(`
      CREATE TABLE IF NOT EXISTS scraper_runs (
        id SERIAL PRIMARY KEY,
        fecha_inicio TIMESTAMPTZ,
        fecha_fin TIMESTAMPTZ,
        duracion_segundos INTEGER,
        duracion_texto TEXT,
        vigentes_finales INTEGER,
        ocultos_finales INTEGER,
        total_sincronizado INTEGER,
        resultado TEXT NOT NULL,
        mensaje_error TEXT,
        modo TEXT,
        raw_json JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Tabla scraper_runs verificada/creada exitosamente.');

    // 2. Insertar los datos
    const {
      fecha_inicio,
      fecha_fin,
      duracion_segundos,
      duracion_texto,
      vigentes_finales,
      ocultos_finales,
      total_sincronizado,
      resultado,
      mensaje_error,
      modo
    } = statusData;

    const query = `
      INSERT INTO scraper_runs (
        fecha_inicio, fecha_fin, duracion_segundos, duracion_texto,
        vigentes_finales, ocultos_finales, total_sincronizado,
        resultado, mensaje_error, modo, raw_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id;
    `;

    const values = [
      fecha_inicio || null,
      fecha_fin || null,
      duracion_segundos || null,
      duracion_texto || null,
      vigentes_finales || null,
      ocultos_finales || null,
      total_sincronizado || null,
      resultado || 'unknown',
      mensaje_error || null,
      modo || null,
      rawJsonText
    ];

    const res = await neon.query(query, values);
    const runId = res.rows[0].id;
    console.log(`Registro insertado exitosamente con ID: ${runId}`);

    try {
      await registrarCambiosProductos(neon, runId);
    } catch (err) {
      console.error('Error al registrar trazabilidad de productos:', err.message);
    }

    await neon.end();
    console.log('Registro completado.');
    process.exit(0);
  } catch (err) {
    console.error('Error al interactuar con la base de datos Neon:', err.message);
    await neon.end();
    process.exit(1);
  }
}

registrarRun();
