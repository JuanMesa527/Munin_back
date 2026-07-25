/**
 * Entry point del proceso. Capa: composicion.
 * `loadEnv()` (el UNICO lugar que lee `process.env`) -> `createApp(env)` ->
 * `listen` -> apagado ordenado en `SIGTERM`. `npm run dev` (tsx watch) y
 * `npm start` (build de produccion) arrancan aqui.
 */

import { createApp } from './app.js';
import { loadEnv } from '@shared/infrastructure/config/env.js';
import { logger } from '@shared/infrastructure/logging/logger.js';

const env = loadEnv();
const app = createApp(env);

const server = app.listen(env.port, (): void => {
  logger.info({ port: env.port }, 'servidor escuchando');
});

/**
 * Apagado ordenado: deja de aceptar conexiones nuevas y cierra las
 * existentes antes de salir, para no cortar un turno de conversacion a
 * mitad de camino cuando el orquestador (Railway/Render/Fly.io) recicla el proceso.
 */
process.on('SIGTERM', (): void => {
  logger.info('SIGTERM recibido, cerrando servidor');
  server.close((): void => {
    process.exit(0);
  });
});
