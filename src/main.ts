/**
 * Punto de entrada del proceso.
 *
 * Solo hace tres cosas: cargar configuracion, levantar el servidor y apagarlo
 * ordenado. Toda la composicion vive en `app.ts`.
 */

import { createApp } from './composition-root.js';
import { loadEnv } from './shared/infrastructure/config/env.js';
import { logger } from './shared/infrastructure/logging/logger.js';

/** Margen para que las conexiones en vuelo terminen antes de matar el proceso. */
const CIERRE_FORZADO_MS = 10_000;

async function main(): Promise<void> {
  // Si la configuracion es invalida esto lanza y el proceso no arranca. Es
  // deliberado (OWASP A05): mejor no arrancar que arrancar mal configurado.
  const env = loadEnv();
  const { server } = await createApp(env);

  const http = server.listen(env.port, () => {
    logger.info(
      { puerto: env.port, entorno: env.nodeEnv },
      'perfilador de vivienda escuchando',
    );
  });

  const apagar = (senal: NodeJS.Signals): void => {
    logger.info({ senal }, 'apagando');
    http.close(() => {
      process.exit(0);
    });
    // Si algo se queda colgado, no dejamos el contenedor zombie.
    setTimeout(() => {
      logger.warn('cierre forzado: habia conexiones sin terminar');
      process.exit(1);
    }, CIERRE_FORZADO_MS).unref();
  };

  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'no se pudo arrancar');
  process.exit(1);
});
