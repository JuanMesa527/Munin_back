/**
 * Logger de la aplicacion (pino). Capa: infrastructure.
 * `console.*` esta prohibido en el backend: todo pasa por aqui para que la
 * redaccion de datos personales sea automatica y no dependa de la disciplina de
 * quien escribe el log a las 3 de la manana.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import type { HttpLogger } from 'pino-http';
import { pinoHttp } from 'pino-http';

/**
 * DEFENSA DE PII EN LOGS — Ley 1581 de 2012 (habeas data).
 *
 * Los logs son un tratamiento de datos mas: si el telefono de un lead queda en
 * el log, seguimos siendo responsables de ese dato y ya no podemos garantizar
 * las finalidades autorizadas ni el derecho de supresion del titular
 * (art. 8, literal e). Por eso la redaccion es del logger y no del llamador.
 *
 * `*.telefono` y `*.cedula` cubren cualquier objeto anidado que arrastre esos
 * campos por descuido; `authorization`, `cookie` y `*.token` protegen la sesion
 * del closer (OWASP A09: logs que filtran credenciales).
 */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  '*.telefono',
  '*.contrasena',
  '*.password',
  '*.token',
  '*.ANTHROPIC_API_KEY',
  '*.cedula',
];

/**
 * Se crea leyendo `process.env` directo y NO `AppEnv` a proposito: si
 * `loadEnv()` falla queremos poder reportar ese fallo con el logger ya vivo.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTADO]' },
  base: { servicio: 'perfilador-vivienda-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Logger HTTP para Express.
 *
 * Serializamos a mano `req`/`res` porque el serializador estandar de pino
 * incluye `remoteAddress` y `remotePort`: la IP es un dato personal y el
 * contrato es explicito en que no la guardamos (`ConsentRecord.canal`, sin IP).
 */
export function createHttpLogger(): HttpLogger {
  return pinoHttp({
    logger,
    serializers: {
      req: (req: IncomingMessage): { metodo: string | undefined; ruta: string | undefined } => ({
        metodo: req.method,
        ruta: req.url,
      }),
      res: (res: ServerResponse): { status: number } => ({ status: res.statusCode }),
    },
    // El health check lo golpean los orquestadores cada pocos segundos: ruido.
    autoLogging: { ignore: (req: IncomingMessage): boolean => req.url === '/api/health' },
  });
}
