/**
 * Endurecimiento del borde HTTP. Capa: infrastructure.
 * `applySecurity` se llama PRIMERO en `app.ts`: si va despues de las rutas, las
 * rutas quedan sin cabeceras ni limites.
 *
 * Cada bloque cita el item de OWASP Top 10 2021 que mitiga. Esto no es adorno:
 * el reto exige seguridad demostrable, y "demostrable" quiere decir que se puede
 * senalar la linea.
 */

import cors from 'cors';
import type { CorsOptions } from 'cors';
import express from 'express';
import type { Express, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmetImport from 'helmet';
import { API_ROUTES } from '@contracts';
import type { AppEnv } from '../config/env.js';

/**
 * helmet 8 tipa mal el default export bajo algunos resolvers (Vercel/NodeNext):
 * a veces llega como namespace y no como factory. Resolvemos el callable real.
 */
function resolveHelmet(): (options?: object) => RequestHandler {
  if (typeof helmetImport === 'function') {
    return helmetImport as (options?: object) => RequestHandler;
  }
  const nested = (helmetImport as unknown as { default?: unknown }).default;
  if (typeof nested === 'function') {
    return nested as (options?: object) => RequestHandler;
  }
  throw new Error('No se pudo resolver el export invocable de helmet');
}

const helmet = resolveHelmet();

/** Un minuto en milisegundos. Los limitadores se leen mejor en minutos. */
const MINUTO_MS = 60 * 1000;

/**
 * Cuerpo del 429. Respeta la envoltura `ApiResponse` del contrato para que el
 * frontend no tenga que tratar el rate limit como un caso raro.
 */
const CUERPO_LIMITE_EXCEDIDO = {
  ok: false,
  error: {
    code: 'RATE_LIMITED',
    message: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
    fields: null,
  },
} as const;

/**
 * OWASP A03 (inyeccion) + A05: limitador del flujo publico `/api/leads/*`.
 * 60 requests / 5 minutos por IP. Un perfilamiento humano completo son ~15
 * turnos de chat, asi que este techo no molesta a un usuario real pero si corta
 * un script que quiera envenenar el dataset o quemar tokens del LLM.
 */
export const publicRateLimiter = rateLimit({
  windowMs: 5 * MINUTO_MS,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: CUERPO_LIMITE_EXCEDIDO,
});

/**
 * OWASP A07 (fallas de identificacion y autenticacion): limitador del login del
 * closer. 10 intentos / 15 minutos por IP para frenar fuerza bruta y relleno de
 * credenciales. Deliberadamente mas estricto que el publico.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * MINUTO_MS,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: CUERPO_LIMITE_EXCEDIDO,
});

/**
 * F5 (call-simulation): mas estricto que `publicRateLimiter` a proposito. Cada
 * turno de la llamada simulada cuesta tokens de DeepSeek Y caracteres de
 * Polly — un bucle accidental (o deliberado) ahi quema dinero real, no solo
 * ciclos de CPU. 40 turnos / 5 minutos alcanza para varias llamadas de
 * entrenamiento seguidas sin abrir la puerta a un abuso caro.
 */
export const simulationRateLimiter = rateLimit({
  windowMs: 5 * MINUTO_MS,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: CUERPO_LIMITE_EXCEDIDO,
});

export function applySecurity(app: Express, env: AppEnv): void {
  // --- OWASP A05 (mala configuracion de seguridad) ---
  // `X-Powered-By` regala la version del framework a cualquier escaner.
  app.disable('x-powered-by');

  // `X-Forwarded-For` solo se cree cuando hay un proxy real delante, y solo
  // hasta `TRUST_PROXY` saltos. Los dos extremos son un fallo distinto:
  //   - de menos (0 detras de Vercel): `req.ip` es la IP interna del proxy,
  //     IGUAL para todo el mundo, asi que los limitadores de arriba meten a
  //     todos los usuarios en el mismo balde y el primer curioso deja al resto
  //     en 429.
  //   - de mas (`true`, o mas saltos de los que hay): cualquiera se inventa su
  //     IP en la cabecera y evade el limitador.
  // Por eso es configuracion y no una constante: en local vale 0, detras de
  // Vercel vale 1.
  app.set('trust proxy', env.trustProxy === 0 ? false : env.trustProxy);

  // --- OWASP A05 + A02 (fallas criptograficas) ---
  // helmet pone las cabeceras defensivas. `hsts` obliga a TLS en el navegador
  // por 180 dias; `no-referrer` evita que la URL de una ficha de lead viaje
  // hacia terceros en el header `Referer`.
  app.use(
    helmet({
      hsts: { maxAge: 15_552_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // --- OWASP A01 (control de acceso roto) ---
  // CORS con allowlist EXPLICITA desde configuracion. `credentials: true` es
  // obligatorio porque la sesion del closer viaja en cookie httpOnly, y por eso
  // mismo `*` esta prohibido: un comodin con credenciales deja que cualquier
  // sitio actue en nombre del closer. `loadEnv` falla si aparece un `*`.
  const opcionesCors: CorsOptions = {
    origin: (origen, callback) => {
      // Sin cabecera `Origin` no hay navegador de por medio (curl, health check,
      // tests): CORS no aplica y no hay nada que proteger.
      if (origen === undefined || env.corsOrigins.includes(origen)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 600,
  };
  app.use(cors(opcionesCors));

  // --- OWASP A03 (inyeccion) ---
  // Solo JSON y con techo de 32 kb: el body mas grande que manejamos es un turno
  // de conversacion (texto acotado a 500 chars en el DTO). Un limite bajo corta
  // de raiz los payloads gigantes de denegacion de servicio.
  //
  // UNICA excepcion: el dictado del closer (adenda A12) sube PCM en base64 y no
  // cabe en 32 kb. Se le da su propio parser en vez de subir el techo global
  // para que la holgura exista SOLO en esa ruta: cualquier otro endpoint sigue
  // rechazando un payload gigante en el parser, antes de tocar codigo nuestro.
  // El tope fino (y el 400 legible) lo pone `TranscribeBodySchema`; este techo
  // es la red de seguridad de mas afuera.
  const jsonEstricto = express.json({ limit: '32kb' });
  const jsonAudio = express.json({ limit: '2mb' });
  app.use((req, res, next) => {
    if (req.path === API_ROUTES.closer.call.transcribe) {
      jsonAudio(req, res, next);
      return;
    }
    jsonEstricto(req, res, next);
  });

  // No habilitamos `express.urlencoded` ni `multipart`: menos parsers, menos
  // superficie de ataque (A05).

  // --- OWASP A09 (fallas de logging y monitoreo) ---
  // El logging HTTP NO se monta aqui: `app.ts` pone `createHttpLogger()` en la
  // linea siguiente, para que quede despues de las cabeceras y antes de las
  // rutas. Se deja constancia del contrato entre ambos: ese logger redacta
  // cookie, authorization, `*.token` y `*.telefono`, y no serializa la IP.
  // Cambiar el orden en `app.ts` rompe esta garantia.
}
