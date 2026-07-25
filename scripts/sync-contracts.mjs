#!/usr/bin/env node
/**
 * Sincroniza `src/shared/contracts.ts` (fuente de verdad, en el backend) hacia
 * el repo del frontend.
 *
 *   node scripts/sync-contracts.mjs           -> copia
 *   node scripts/sync-contracts.mjs --check   -> solo verifica (falla si difieren)
 *
 * Por que existe: el contrato esta duplicado a proposito (decision de la
 * seccion 5 del brief: para 1 dia, un archivo identico en ambos repos pesa
 * menos que publicar un paquete). El costo de duplicar es la deriva silenciosa,
 * asi que `npm run verify` corre `--check` y rompe el build si alguien edito la
 * copia del frontend en vez de la fuente.
 *
 * Ubicacion del frontend: variable `FRONTEND_PATH`, o el primer candidato de
 * `CANDIDATOS_FRONTEND` que exista al lado de este repo.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const backendRepo = resolve(here, '..');

const SOURCE = resolve(backendRepo, 'src/shared/contracts.ts');

/**
 * Nombres con los que puede estar clonado el repo del frontend al lado de este.
 * Se busca por existencia y no por convencion porque el nombre del directorio
 * lo decide quien clona, no nosotros.
 */
const CANDIDATOS_FRONTEND = ['../perfilador-vivienda-frontend', '../Munin_front'];

const frontendRepo = process.env.FRONTEND_PATH
  ? resolve(process.env.FRONTEND_PATH)
  : (CANDIDATOS_FRONTEND.map((c) => resolve(backendRepo, c)).find(existsSync) ??
    resolve(backendRepo, CANDIDATOS_FRONTEND[0]));
const TARGET = resolve(frontendRepo, 'src/shared/contracts.ts');

const checkOnly = process.argv.includes('--check');
const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

if (!existsSync(SOURCE)) {
  console.error(`[contracts] No encuentro la fuente de verdad: ${SOURCE}`);
  process.exit(1);
}

const source = readFileSync(SOURCE, 'utf8');

if (!existsSync(frontendRepo)) {
  const msg = `[contracts] No encuentro el repo del frontend en ${frontendRepo}. Define FRONTEND_PATH.`;
  if (checkOnly) {
    console.warn(`${msg} Salto la verificacion.`);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}

const target = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : null;

if (source === target) {
  console.log(`[contracts] En sync. sha256=${sha(source)}`);
  process.exit(0);
}

if (checkOnly) {
  console.error(
    [
      '[contracts] DESINCRONIZADO.',
      `  backend  sha256=${sha(source)}`,
      `  frontend sha256=${target === null ? '(no existe)' : sha(target)}`,
      '',
      '  El contrato es fuente de verdad en el BACKEND (src/shared/contracts.ts).',
      '  Si el cambio real es tuyo y esta en el backend:  npm run contracts:sync',
      '  Si editaste la copia del frontend: revertila, muevela al backend y sincroniza.',
      '',
      '  Recorda la regla 16: un cambio al contrato ROMPE A TODO EL EQUIPO.',
      '  Anuncialo antes de mergear.',
    ].join('\n'),
  );
  process.exit(1);
}

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, source, 'utf8');
console.log(`[contracts] Copiado -> ${TARGET}  sha256=${sha(source)}`);
console.log('[contracts] Recorda anunciar al equipo cualquier cambio del contrato (regla 16).');
