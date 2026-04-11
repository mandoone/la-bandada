/**
 * validar-categorias-oficiales.js
 *
 * Compara la estructura oficial de categorías (categorias-oficiales-dlds.json)
 * contra los datos reales en products_raw y genera un reporte de diferencias.
 *
 * Uso: node validar-categorias-oficiales.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// ── Conexión a la base de datos ──────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ── Normalización tipo slug ──────────────────────────────────────────────────
// Convierte "Automáticas XL" → "automaticas-xl", "PH, EC Y T°" → "ph-ec-y-t"
// Se usa para comparar JSON oficial (nombres visuales) contra BD (slugs reales).
function slug(str) {
  if (!str) return '';
  return str
    .trim()
    .normalize('NFD')                 // descomponer letras acentuadas
    .replace(/[\u0300-\u036f]/g, '')  // quitar diacríticos (tildes, diéresis…)
    .toLowerCase()
    .replace(/&/g, 'y')               // & → y
    .replace(/[()[\]]/g, '')          // quitar paréntesis y corchetes
    .replace(/[°.,;:!¡?¿]/g, '')      // quitar signos de puntuación y símbolos
    .replace(/\s+/g, '-')             // espacios → guiones
    .replace(/-+/g, '-')              // colapsar múltiples guiones
    .replace(/[^a-z0-9-]/g, '')       // eliminar cualquier otro carácter raro
    .replace(/^-+|-+$/g, '');         // quitar guiones al inicio/final
}

// ── Tipos de problema ────────────────────────────────────────────────────────
const TIPOS = {
  FALTANTE:        'FALTANTE',        // en JSON oficial pero ausente en BD
  SOBRANTE:        'SOBRANTE',        // en BD pero ausente en JSON oficial
  NOMBRE_DISTINTO: 'NOMBRE_DISTINTO', // slug coincide pero nombre visual difiere
  VACIO:           'VACIO',           // campo categoria/subcategoria vacío
  SEMILLA_SIN_SUB2:'SEMILLA_SIN_SUB2',// semilla sin sub2
};

// ── Entrada principal ────────────────────────────────────────────────────────
async function main() {

  // ── 1. Leer y parsear el JSON oficial ─────────────────────────────────────
  const jsonPath   = path.join(__dirname, 'categorias-oficiales-dlds.json');
  const oficialRaw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Estructura: oficialIdx[slugCat] = { original, subcats: { [slugSub]: { original, sub2: Map(slug→orig) } } }
  const oficialIdx = {};

  for (const [cat, subcats] of Object.entries(oficialRaw)) {
    const sc = slug(cat);
    oficialIdx[sc] = { original: cat, subcats: {} };

    for (const [subcat, sub2list] of Object.entries(subcats)) {
      const ss = slug(subcat);
      const sub2Map = new Map(); // slug → nombre original del JSON
      for (const s2 of sub2list) sub2Map.set(slug(s2), s2);
      oficialIdx[sc].subcats[ss] = { original: subcat, sub2Map };
    }
  }

  // ── 2. Consultar products_raw ──────────────────────────────────────────────
  const client = await pool.connect();
  let rows;
  try {
    const result = await client.query(`
      SELECT DISTINCT categoria, subcategoria, sub2, nombre, producto_url, stock
      FROM products_raw
      ORDER BY categoria, subcategoria, sub2
    `);
    rows = result.rows;
  } finally {
    client.release();
  }

  console.log(`\n📦 Filas distintas en products_raw: ${rows.length}`);

  // ── 3. Indexar estructura real de la BD ───────────────────────────────────
  // realIdx[slugCat] = { original, subcats: { [slugSub]: { original, sub2: Map(slug→orig) } } }
  const realIdx = {};

  const vaciosCat  = []; // filas con categoria vacía
  const vaciosSub  = []; // filas con subcategoria vacía
  const semSinSub2 = []; // semillas sin sub2

  for (const row of rows) {
    const cat  = row.categoria    ?? '';
    const sub  = row.subcategoria ?? '';
    const sub2 = row.sub2         ?? '';
    const sc   = slug(cat);
    const ss   = slug(sub);
    const ss2  = slug(sub2);

    if (!sc) { vaciosCat.push(row);  continue; }
    if (!ss) { vaciosSub.push(row); /* indexar cat de todos modos */ }

    // Semillas sin sub2: detectar por slug para no depender del valor exacto del campo
    if (sc === 'semillas' && !ss2) semSinSub2.push(row);

    if (!realIdx[sc]) realIdx[sc] = { original: cat, subcats: {} };

    if (ss && !realIdx[sc].subcats[ss]) {
      realIdx[sc].subcats[ss] = { original: sub, sub2Map: new Map() };
    }
    if (ss && ss2 && !realIdx[sc].subcats[ss].sub2Map.has(ss2)) {
      realIdx[sc].subcats[ss].sub2Map.set(ss2, sub2);
    }
  }

  // ── 4. Comparar y generar issues ──────────────────────────────────────────
  const issues = [];
  const add = (tipo, categoria, subcategoria, sub2, detalle) =>
    issues.push({ tipo, categoria, subcategoria, sub2, detalle });

  // ── 4a. Oficial → BD: FALTANTE o NOMBRE_DISTINTO ─────────────────────────
  for (const [sc, catInfo] of Object.entries(oficialIdx)) {
    const catOficial = catInfo.original;

    if (!realIdx[sc]) {
      // La categoría entera falta en BD
      add(TIPOS.FALTANTE, catOficial, '', '', `Categoría "${catOficial}" no existe en BD`);
      for (const [, subInfo] of Object.entries(catInfo.subcats)) {
        add(TIPOS.FALTANTE, catOficial, subInfo.original, '',
          `Subcategoría "${subInfo.original}" no existe en BD (cat faltante)`);
        for (const [, s2Orig] of subInfo.sub2Map)
          add(TIPOS.FALTANTE, catOficial, subInfo.original, s2Orig,
            `Sub2 "${s2Orig}" no existe en BD (cat faltante)`);
      }
      continue;
    }

    // Categoría existe por slug → revisar nombre visual
    const catReal = realIdx[sc].original;
    if (catReal !== catOficial) {
      add(TIPOS.NOMBRE_DISTINTO, catOficial, '', '',
        `Categoría: JSON="${catOficial}" | BD="${catReal}"`);
    }

    // Revisar subcategorías
    for (const [ss, subInfo] of Object.entries(catInfo.subcats)) {
      const subOficial = subInfo.original;

      if (!realIdx[sc].subcats[ss]) {
        add(TIPOS.FALTANTE, catOficial, subOficial, '',
          `Subcategoría "${subOficial}" no existe en BD`);
        for (const [, s2Orig] of subInfo.sub2Map)
          add(TIPOS.FALTANTE, catOficial, subOficial, s2Orig,
            `Sub2 "${s2Orig}" no existe en BD (subcat faltante)`);
        continue;
      }

      // Subcategoría existe → revisar nombre visual
      const subReal = realIdx[sc].subcats[ss].original;
      if (subReal !== subOficial) {
        add(TIPOS.NOMBRE_DISTINTO, catOficial, subOficial, '',
          `Subcategoría: JSON="${subOficial}" | BD="${subReal}"`);
      }

      // Revisar sub2
      const realSub2Map = realIdx[sc].subcats[ss].sub2Map;
      for (const [ss2, s2Oficial] of subInfo.sub2Map) {
        if (!realSub2Map.has(ss2)) {
          add(TIPOS.FALTANTE, catOficial, subOficial, s2Oficial,
            `Sub2 "${s2Oficial}" no existe en BD`);
        } else {
          // Sub2 existe → revisar nombre visual
          const s2Real = realSub2Map.get(ss2);
          if (s2Real !== s2Oficial) {
            add(TIPOS.NOMBRE_DISTINTO, catOficial, subOficial, s2Oficial,
              `Sub2: JSON="${s2Oficial}" | BD="${s2Real}"`);
          }
        }
      }
    }
  }

  // ── 4b. BD → Oficial: SOBRANTE ────────────────────────────────────────────
  for (const [sc, catInfo] of Object.entries(realIdx)) {
    const catReal = catInfo.original;

    if (!oficialIdx[sc]) {
      add(TIPOS.SOBRANTE, catReal, '', '',
        `Categoría "${catReal}" existe en BD pero no en el oficial`);
      for (const [, subInfo] of Object.entries(catInfo.subcats)) {
        add(TIPOS.SOBRANTE, catReal, subInfo.original, '',
          `Subcategoría "${subInfo.original}" existe en BD pero no en el oficial`);
        for (const [, s2Real] of subInfo.sub2Map)
          add(TIPOS.SOBRANTE, catReal, subInfo.original, s2Real,
            `Sub2 "${s2Real}" existe en BD pero no en el oficial`);
      }
      continue;
    }

    for (const [ss, subInfo] of Object.entries(catInfo.subcats)) {
      const subReal = subInfo.original;

      if (!oficialIdx[sc].subcats[ss]) {
        add(TIPOS.SOBRANTE, catReal, subReal, '',
          `Subcategoría "${subReal}" existe en BD pero no en el oficial`);
        for (const [, s2Real] of subInfo.sub2Map)
          add(TIPOS.SOBRANTE, catReal, subReal, s2Real,
            `Sub2 "${s2Real}" existe en BD pero no en el oficial`);
        continue;
      }

      // Sub2 sobrantes
      const oficialSub2Map = oficialIdx[sc].subcats[ss].sub2Map;
      for (const [ss2, s2Real] of subInfo.sub2Map) {
        if (!oficialSub2Map.has(ss2))
          add(TIPOS.SOBRANTE, catReal, subReal, s2Real,
            `Sub2 "${s2Real}" existe en BD pero no en el oficial`);
      }
    }
  }

  // ── 4c. Vacíos ────────────────────────────────────────────────────────────
  for (const row of vaciosCat)
    add(TIPOS.VACIO, '', '', '',
      `Producto sin categoría: "${row.nombre}" (${row.producto_url})`);

  for (const row of vaciosSub)
    add(TIPOS.VACIO, row.categoria, '', '',
      `Producto sin subcategoría: "${row.nombre}" (${row.producto_url})`);

  // ── 4d. Semillas sin sub2 ─────────────────────────────────────────────────
  for (const row of semSinSub2)
    add(TIPOS.SEMILLA_SIN_SUB2, row.categoria, row.subcategoria, '',
      `Semilla sin sub2: "${row.nombre}" (${row.producto_url})`);

  // ── 5. Imprimir resumen en consola ────────────────────────────────────────
  const conteos = {};
  for (const t of Object.values(TIPOS)) conteos[t] = 0;
  for (const issue of issues) conteos[issue.tipo]++;

  const ancho = 52;
  const linea = '═'.repeat(ancho);
  console.log(`\n${linea}`);
  console.log('  VALIDACIÓN DE CATEGORÍAS OFICIALES vs BD');
  console.log(linea);
  console.log(`  FALTANTES         : ${conteos[TIPOS.FALTANTE]}`);
  console.log(`  SOBRANTES         : ${conteos[TIPOS.SOBRANTE]}`);
  console.log(`  NOMBRE_DISTINTO   : ${conteos[TIPOS.NOMBRE_DISTINTO]}`);
  console.log(`  VACÍOS            : ${conteos[TIPOS.VACIO]}`);
  console.log(`  SEMILLAS SIN SUB2 : ${conteos[TIPOS.SEMILLA_SIN_SUB2]}`);
  console.log(`  TOTAL ISSUES      : ${issues.length}`);
  console.log(linea + '\n');

  // Detalle agrupado por tipo
  for (const tipo of Object.values(TIPOS)) {
    const grupo = issues.filter(i => i.tipo === tipo);
    if (grupo.length === 0) continue;
    console.log(`── ${tipo} (${grupo.length}) ${'─'.repeat(Math.max(0, 38 - tipo.length))}`);
    for (const issue of grupo) {
      const ruta = [issue.categoria, issue.subcategoria, issue.sub2]
        .filter(Boolean).join(' > ');
      console.log(`  [${ruta || '(sin ruta)'}] ${issue.detalle}`);
    }
    console.log('');
  }

  // ── 6. Exportar CSV ───────────────────────────────────────────────────────
  const csvPath = path.join(__dirname, 'validacion-categorias.csv');
  const BOM     = '\uFEFF'; // BOM UTF-8 para compatibilidad con Excel

  const escape = (val) => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header  = 'tipo,categoria,subcategoria,sub2,detalle\n';
  const csvRows = issues.map(i =>
    [i.tipo, i.categoria, i.subcategoria, i.sub2, i.detalle].map(escape).join(',')
  );

  fs.writeFileSync(csvPath, BOM + header + csvRows.join('\n'), 'utf8');
  console.log(`✅ CSV exportado en: ${csvPath}`);
  console.log(`   Total de filas  : ${issues.length}\n`);

  await pool.end();
}

main().catch(err => {
  console.error('Error al ejecutar la validación:', err);
  process.exit(1);
});
