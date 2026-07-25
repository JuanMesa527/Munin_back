/**
 * Seed de Supabase para F2.1. Reproducible e idempotente.
 *
 *   1. crea el bucket publico `project-renders` (ignora si ya existe)
 *   2. sube los 16 renders desde el /public del front (x-upsert)
 *   3. upsert del catalogo (data/projects_catalog.json) en la tabla `projects`,
 *      con `imagen_url` apuntando al render en Storage
 *
 * REQUISITOS: haber aplicado antes el schema (supabase/migrations/0001_*.sql) y
 * tener SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en el .env. El service role key
 * IGNORA RLS: este script es una tarea de operacion, no corre en el navegador.
 *
 * Uso:  node scripts/seed-supabase.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ quiet: true });

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el .env');
  process.exit(1);
}

const BUCKET = 'project-renders';
const AQUI = fileURLToPath(new URL('.', import.meta.url));
const CATALOGO = join(AQUI, '..', 'data', 'projects_catalog.json');
// Los renders viven en el /public del front (offline-friendly para la demo).
const RENDERS = join(AQUI, '..', '..', 'Munin_front', 'public', 'proyectos');

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

/** URL publica de un render en Storage a partir del basename del archivo. */
function urlPublica(archivo) {
  return `${URL}/storage/v1/object/public/${BUCKET}/${archivo}`;
}

async function crearBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`bucket: ${error.message}`);
  }
  console.log(`bucket ${BUCKET} listo`);
}

async function subirRenders() {
  if (!existsSync(RENDERS)) {
    console.warn(`(sin dir de renders en ${RENDERS}; se omite la subida)`);
    return;
  }
  const files = readdirSync(RENDERS).filter((f) => f.endsWith('.webp'));
  for (const f of files) {
    const bin = readFileSync(join(RENDERS, f));
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(f, bin, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error(`upload ${f}: ${error.message}`);
  }
  console.log(`${files.length} renders subidos`);
}

async function upsertProyectos() {
  const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8'));
  const version = catalogo.version ?? null;
  const proyectos = Array.isArray(catalogo) ? catalogo : catalogo.proyectos;

  const filas = proyectos.map((p) => ({
    proyecto_id: p.proyectoId,
    nombre: p.nombre,
    ubicacion: p.ubicacion,
    ciudad: p.ciudad,
    zona: p.zona,
    es_vis: p.esVIS,
    descripcion: p.descripcion,
    unidades: p.unidades,
    torres: p.torres,
    pisos: p.pisos,
    area_desde: p.areaDesde,
    area_hasta: p.areaHasta,
    habitaciones_desde: p.habitacionesDesde,
    habitaciones_hasta: p.habitacionesHasta,
    tipologias: p.tipologias,
    amenidades: p.amenidades,
    lugares_cercanos: p.lugaresCercanos,
    entrega: p.entrega,
    certificacion_edge: p.certificacionEdge,
    sala_de_ventas: p.salaDeVentas,
    brochure_url: p.brochureUrl,
    imagen: p.imagen,
    imagen_url: urlPublica(basename(p.imagen)),
    precio: p.precio,
    ficha: p, // ProjectCard completo, sin perder fidelidad
    catalogo_version: version,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('projects').upsert(filas, { onConflict: 'proyecto_id' });
  if (error) throw new Error(`projects: ${error.message}`);
  console.log(`${filas.length} proyectos upserted (catalogo v${version})`);
}

try {
  await crearBucket();
  await subirRenders();
  await upsertProyectos();
  console.log('\nseed completo ✔');
} catch (e) {
  console.error(`\nseed FALLO: ${e.message}`);
  process.exit(1);
}
