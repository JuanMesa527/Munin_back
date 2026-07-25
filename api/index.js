/**
 * ENTRYPOINT SERVERLESS (Vercel). Capa: infrastructure.
 *
 * `src/main.ts` sigue siendo el entrypoint del proceso normal (local, docker,
 * cualquier PaaS con puerto). Aqui NO se puede usar: una funcion serverless no
 * escucha un puerto, recibe `(req, res)` y termina. `app.listen()` en este
 * contexto es justo el FUNCTION_INVOCATION_FAILED que veiamos.
 *
 * Se importa `dist/` y no `src/`: el bundler de Vercel no aplica los alias de
 * `tsconfig.paths`, asi que el JS ya compilado por `npm run build` (con
 * `tsc-alias`) es la unica entrada con imports que Node resuelve.
 *
 * `vercel.json` reescribe TODO a esta funcion; el enrutamiento real lo sigue
 * haciendo Express con las rutas de `@contracts`, no la plataforma.
 */

import { createApp } from '../dist/app.js';
import { loadEnv } from '../dist/shared/infrastructure/config/env.js';
import { logger } from '../dist/shared/infrastructure/logging/logger.js';

/**
 * La app se construye UNA vez por instancia y se reusa en las siguientes
 * invocaciones (cold start vs warm). Guardamos la promesa, no la app: si dos
 * peticiones entran a la vez durante el arranque, ambas esperan la misma
 * construccion en vez de levantar dos.
 */
let appEnConstruccion = null;

function obtenerApp() {
  appEnConstruccion ??= createApp(loadEnv()).then((app) => app.server);
  return appEnConstruccion;
}

/**
 * Cuerpo de fallo de arranque, en la envoltura `ApiResponse` del contrato para
 * que el frontend no tenga que tratar este caso como uno especial. Mensaje
 * deliberadamente pobre: el detalle de una mala configuracion (que variable
 * falta) le sirve mas a un atacante que al usuario, y ya quedo en el log.
 */
const CUERPO_ARRANQUE_FALLIDO = JSON.stringify({
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Ocurrio un error inesperado. Intentalo de nuevo.',
    fields: null,
  },
});

export default async function handler(req, res) {
  let server;

  try {
    server = await obtenerApp();
  } catch (error) {
    // `loadEnv()` lanza si falta una variable en el proyecto de Vercel. Se
    // limpia la cache para que la siguiente invocacion reintente: asi arreglar
    // la variable en el dashboard basta, sin redeploy.
    appEnConstruccion = null;
    logger.fatal({ err: error }, 'no se pudo construir la app en serverless');

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(CUERPO_ARRANQUE_FALLIDO);
    return;
  }

  // Una app de Express ES un `(req, res) => void`: se la pasamos tal cual y ella
  // aplica seguridad, rutas, 404 y `errorHandler` como en el servidor normal.
  server(req, res);
}
