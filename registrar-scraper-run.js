require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const statusFilePath = path.join(__dirname, 'logs', 'last-run-status.json');

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
    console.log(`Registro insertado exitosamente con ID: ${res.rows[0].id}`);

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
