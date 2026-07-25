/**
 * ENTRYPOINT DE VERCEL. El entrypoint real del proyecto sigue siendo
 * `src/main.ts`: es el que se usa en local, en docker y en cualquier PaaS con
 * puerto, y el que tiene el apagado ordenado. Aqui no va logica de negocio.
 *
 * Este archivo existe por dos exigencias del preset de Node.js de Vercel, las
 * dos aprendidas a golpes:
 *
 *  1. BUSCA EL ENTRYPOINT POR NOMBRE: `app.*`, `index.*`, `server.*`, en la
 *     raiz y bajo `src/`. Cuando el composition root se llamaba `src/app.ts`,
 *     elegia ese: lo compilaba por su cuenta, sin aplicar `tsc-alias`, y el
 *     proceso moria con ERR_INVALID_MODULE_SPECIFIER sobre `@contracts`. Por
 *     eso hoy se llama `src/composition-root.ts` y ningun archivo de `src/`
 *     puede llamarse `app`, `index` ni `server`.
 *
 *  2. EXIGE QUE EL ENTRYPOINT IMPORTE EXPRESS. No le basta con que lo importe
 *     algo de la cadena: mira este archivo. Por eso la instancia se crea aqui y
 *     se le pasa a `createApp`, en vez de reexportar `dist/main.js`.
 *
 * Se importa de `dist/` y no de `src/`: es el JS que ya paso por `tsc-alias`,
 * el unico con imports que Node resuelve sin ayuda.
 */

import express from 'express';
import { createApp } from './dist/composition-root.js';
import { loadEnv } from './dist/shared/infrastructure/config/env.js';
import { logger } from './dist/shared/infrastructure/logging/logger.js';

try {
  // Si la configuracion es invalida esto lanza y el proceso no arranca. Es
  // deliberado (OWASP A05): mejor no arrancar que arrancar mal configurado.
  const env = loadEnv();
  const { server } = await createApp(env, express());

  // `env.port` sale de `PORT`, que en Vercel inyecta la plataforma.
  server.listen(env.port, () => {
    logger.info(
      { puerto: env.port, entorno: env.nodeEnv },
      'perfilador de vivienda escuchando',
    );
  });
} catch (error) {
  logger.fatal({ err: error }, 'no se pudo arrancar');
  process.exit(1);
}
