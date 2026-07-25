/**
 * COMPOSITION ROOT del backend.
 *
 * NO LO RENOMBRES A `app.ts`. Vercel busca su entrypoint por nombre —
 * `app.*`, `index.*`, `server.*`, en la raiz y en `src/`— y cuando este archivo
 * se llamaba `app.ts` lo elegia a el: lo compilaba por su cuenta, sin resolver
 * los alias de `tsconfig.paths`, y el deploy moria con
 * ERR_INVALID_MODULE_SPECIFIER sobre `@contracts`. El entrypoint es
 * `server.js` en la raiz, y este archivo tiene que quedar fuera de esa busqueda.
 *
 * Este es el UNICO archivo que sabe que implementacion concreta se usa. Cambiar
 * memoria por PostgreSQL, o el stub de LLM por Anthropic/DeepSeek, se hace aqui
 * y en ningun otro lado: los casos de uso solo conocen puertos. Ese desacople es
 * el argumento del slide de integracion a producto.
 *
 * ORDEN DE LOS MIDDLEWARE (no lo cambies sin leer `security.ts`):
 *   1. applySecurity   -> cabeceras, CORS, parser de JSON con techo
 *   2. httpLogger      -> despues de las cabeceras, antes de las rutas, con
 *                         redaccion de PII ya configurada
 *   3. rate limit + rutas de features (F1 + F2.1 + F2.2 + F3/F4 + F5)
 *   4. notFoundHandler -> 404 en formato `ApiResponse`
 *   5. errorHandler    -> ultima red, 4 argumentos
 */

import express from 'express';
import type { Express } from 'express';
import { API_ROUTES } from '@contracts';
import { createCallSimulationModule } from './features/call-simulation/call-simulation.module.js';
import {
  createCallSimulator,
  createSpeechSynthesis,
  createSpeechTranscription,
  createCallHighlights,
  createCallRecordingStore,
} from './features/call-simulation/infrastructure/call-simulation.factory.js';
import { InMemoryCallSessionStore } from './features/call-simulation/infrastructure/in-memory-call-session.store.js';
import { createCloserBriefingModule } from './features/closer-briefing/closer-briefing.module.js';
import { createCloserDashboardModule } from './features/closer-dashboard/closer-dashboard.module.js';
import { EnvCloserAuthAdapter } from './features/closer-dashboard/infrastructure/env-closer-auth.adapter.js';
import { createLeadIntakeModule } from './features/lead-intake/lead-intake.module.js';
import { createLeadEnrichmentModule } from './features/lead-enrichment/lead-enrichment.module.js';
import { createLeadEducationModule } from './features/lead-education/lead-education.module.js';
import { seedDemoLeads as seedEducationDemoLeads } from './features/lead-education/infrastructure/demo-seed.js';
import type { SwipeStorePort } from './features/lead-enrichment/application/ports/swipe-store.port.js';
import type { TelemetryStorePort } from './features/lead-enrichment/application/ports/telemetry.port.js';
import { InMemorySwipeStore } from './features/lead-enrichment/infrastructure/in-memory-swipe.store.js';
import { NoopTelemetryStore } from './features/lead-enrichment/infrastructure/noop-telemetry.store.js';
import { SupabaseSwipeStore } from './features/lead-enrichment/infrastructure/supabase-swipe.store.js';
import { SupabaseTelemetryStore } from './features/lead-enrichment/infrastructure/supabase-telemetry.store.js';
import type { LeadContactLookupPort } from './shared/application/ports/lead-contact-lookup.port.js';
import type { LeadRepository } from './shared/application/ports/lead-repository.port.js';
import type { AppEnv } from './shared/infrastructure/config/env.js';
import { PinoAuditLogAdapter } from './shared/infrastructure/audit/pino-audit-log.adapter.js';
import { SystemClock } from './shared/infrastructure/clock/system-clock.adapter.js';
import { FileDataCatalogAdapter } from './shared/infrastructure/catalog/file-data-catalog.adapter.js';
import { errorHandler, notFoundHandler } from './shared/infrastructure/http/error-handler.js';
import {
  applySecurity,
  authRateLimiter,
  otpRequestRateLimiter,
  otpVerifyRateLimiter,
  publicRateLimiter,
  simulationRateLimiter,
} from './shared/infrastructure/http/security.js';
import { CryptoIdGenerator } from './shared/infrastructure/id/crypto-id-generator.adapter.js';
import { createHttpLogger, logger } from './shared/infrastructure/logging/logger.js';
import type { EducationJourneyRepository } from './shared/application/ports/education-repository.port.js';
import { InMemoryLeadOtpStore } from './features/lead-education/infrastructure/in-memory-lead-otp.store.js';
import { InMemoryEducationRepository } from './shared/infrastructure/persistence/in-memory/in-memory-education.repository.js';
import { InMemoryLeadContactLookup } from './shared/infrastructure/persistence/in-memory/in-memory-lead-contact-lookup.adapter.js';
import { InMemoryLeadRepository } from './shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { InMemoryLeadSessionStore } from './shared/infrastructure/persistence/in-memory/in-memory-lead-session.store.js';
import { InMemorySessionStore } from './shared/infrastructure/persistence/in-memory/in-memory-session.store.js';
import { seedDemoLeads } from './shared/infrastructure/persistence/demo-seed.js';
import { createSupabaseClient } from './shared/infrastructure/persistence/supabase/supabase-client.js';
import type { AppSupabaseClient } from './shared/infrastructure/persistence/supabase/supabase-client.js';
import { SupabaseEducationRepository } from './shared/infrastructure/persistence/supabase/supabase-education.repository.js';
import { SupabaseLeadContactLookup } from './shared/infrastructure/persistence/supabase/supabase-lead-contact-lookup.adapter.js';
import { SupabaseLeadRepository } from './shared/infrastructure/persistence/supabase/supabase-lead.repository.js';
import { InMemoryContactVaultAdapter } from './shared/infrastructure/security/in-memory-contact-vault.adapter.js';

/** Prefijo de las rutas de F2.2, derivado del contrato para no inventar URLs. */
const PREFIJO_EDUCATION = API_ROUTES.education.journey.replace(/\/journey$/u, '');

export interface App {
  readonly server: Express;
}

/**
 * `server` se puede inyectar y por defecto se crea aqui. No es un punto de
 * extension: existe porque el detector de Vercel identifica el proyecto
 * buscando un `import` de express EN EL ENTRYPOINT, y el entrypoint de la
 * plataforma (`server.js`) no puede importar este archivo sin mas. Al recibir
 * la instancia, express queda importado alli de verdad y no como adorno.
 */
export async function createApp(env: AppEnv, server: Express = express()): Promise<App> {
  applySecurity(server, env);
  server.use(createHttpLogger());

  // --- Adapters concretos (la unica eleccion de implementacion del backend) ---
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const audit = new PinoAuditLogAdapter();
  const vault = new InMemoryContactVaultAdapter({ ids, clock, audit });
  const sessionStore = new InMemorySessionStore({
    clock,
    ttlMinutos: env.closerSessionTtlMinutes,
  });
  const auth = new EnvCloserAuthAdapter({
    username: env.closerUsername,
    password: env.closerPassword,
    clock,
    ttlMinutes: env.closerSessionTtlMinutes,
  });
  // Login por OTP del lead (F2.2, adenda A14): igual que la sesion del
  // closer, SIEMPRE en memoria — el OTP y la sesion son estado efimero
  // (TTL corto), a diferencia del journey, que si necesitaba sobrevivir un
  // restart (bloque 1 del plan).
  const leadOtp = new InMemoryLeadOtpStore({ clock });
  const leadSessionStore = new InMemoryLeadSessionStore({
    clock,
    ttlMinutos: env.leadSessionTtlMinutes,
  });
  const catalogo = new FileDataCatalogAdapter({
    weightsPath: env.weightsPath,
    projectProfilesPath: env.projectProfilesPath,
    projectsCatalogPath: env.projectsCatalogPath,
  });

  let leads: LeadRepository;
  // Se retiene para F5: el archivo de llamadas usa el MISMO cliente en vez de
  // abrir una segunda conexion con la misma llave.
  let supabaseClient: AppSupabaseClient | null = null;
  // Swipes y telemetria: Supabase cuando el driver lo pide, memoria/no-op si no.
  // Es la unica eleccion memoria-vs-DB de F2.1, y vive solo aqui.
  let swipes: SwipeStorePort;
  let telemetry: TelemetryStorePort;
  // F2.2 lead-education + F4 briefing: mismo repositorio de journeys.
  let journeys: EducationJourneyRepository;
  // Login por OTP del lead (F2.2): resuelve telefono/email -> leadId contra
  // el MISMO almacen de leads, sin tocar el puerto compartido `LeadRepository`.
  let contactLookup: LeadContactLookupPort;
  if (
    env.persistenceDriver === 'supabase' &&
    env.supabaseUrl !== null &&
    env.supabaseServiceRoleKey !== null
  ) {
    const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    supabaseClient = supabase;
    leads = new SupabaseLeadRepository(supabase);
    swipes = new SupabaseSwipeStore(supabase);
    telemetry = new SupabaseTelemetryStore(supabase);
    journeys = new SupabaseEducationRepository(supabase);
    contactLookup = new SupabaseLeadContactLookup(supabase);
    logger.info({ driver: 'supabase' }, 'persistencia en Supabase');
  } else {
    const inMemoryLeads = new InMemoryLeadRepository();
    leads = inMemoryLeads;
    swipes = new InMemorySwipeStore();
    telemetry = new NoopTelemetryStore();
    journeys = new InMemoryEducationRepository();
    contactLookup = new InMemoryLeadContactLookup(inMemoryLeads);
    logger.info({ driver: 'memory' }, 'persistencia en memoria');
  }

  // Los leads de demo NUNCA se siembran en produccion: alli los leads los crea
  // F1 con consentimiento real del titular.
  // Un fallo sembrando datos de DEMO no puede impedir que el servidor arranque:
  // sin este `catch`, un id o un esquema desalineado en la base tumbaba toda la
  // app en desarrollo y dejaba F1..F5 inaccesibles por unos leads de ejemplo.
  if (!env.isProduction) {
    try {
      await seedDemoLeads(leads, vault);
      // Perfiles NO VIABLES adicionales (carril de nutricion de F2.2), distintos
      // de los `viable` de arriba: ids propios (`demo-lead-*`), sin colision.
      await seedEducationDemoLeads(leads, clock.now());
    } catch (causa) {
      logger.error({ err: causa }, 'no se pudieron sembrar los leads de demo; se sigue sin ellos');
    }
  }

  // --- Health check: sin rate limit, para que el PaaS no se auto-bloquee ---
  server.get(API_ROUTES.health, (_req, res) => {
    res.json({ ok: true, data: { estado: 'vivo', at: clock.now() } });
  });

  // --- Flujo publico del usuario final (sin login, autogestionado) ---
  // F1 lead-intake: comparte el MISMO `leads` que F2.1/F2.2 (son un solo flujo).
  // Su router aplica su propio rate limit dentro del modulo.
  // `vault` es el MISMO que recibe el briefing (F4) mas abajo: F1 emite el
  // token de contacto y F4 lo canjea. Dos instancias = "revelar contacto" roto.
  const intake = createLeadIntakeModule(env, { leads, vault });
  server.use(intake.router);

  // F2.1 lead-enrichment: expande info del lead viable.
  const enrichment = createLeadEnrichmentModule({ leads, catalogo, clock, swipes, telemetry });
  server.use(publicRateLimiter, enrichment.router);

  // F2.2 lead-education: camino gamificado de nutricion para leads no viables.
  const education = createLeadEducationModule({
    journeys,
    leads,
    catalog: catalogo,
    clock,
    ids,
    contactLookup,
    otp: leadOtp,
    sessionStore: leadSessionStore,
    secureCookie: env.isProduction,
    sessionTtlMinutes: env.leadSessionTtlMinutes,
    isProduction: env.isProduction,
  });
  // Limitadores mas estrictos SOLO en las 2 rutas que "envian"/verifican OTP,
  // mismo criterio que `authRateLimiter` del closer: se acotan a su ruta
  // exacta para no capturar `/journey`/`/progress`, que siguen publicas.
  server.use(API_ROUTES.education.auth.requestOtp, otpRequestRateLimiter);
  server.use(API_ROUTES.education.auth.verifyOtp, otpVerifyRateLimiter);
  server.use(PREFIJO_EDUCATION, education.authRouter);
  server.use(PREFIJO_EDUCATION, publicRateLimiter, education.router);

  // --- Login publico; el resto de las rutas closer exige sesion verificada ---
  const dashboard = createCloserDashboardModule({
    auth,
    sessionStore,
    secureCookie: env.isProduction,
    sessionTtlMinutes: env.closerSessionTtlMinutes,
    leads,
  });
  // El limitador estricto aplica solo al login, no a intake ni a otras rutas
  // publicas. El guard se acota al namespace closer para no capturar F1/F2.x.
  server.use(API_ROUTES.closer.login, authRateLimiter);
  server.use(dashboard.publicRouter);
  server.use('/api/closer', dashboard.requireCloser);
  server.use(dashboard.protectedRouter);

  const briefing = createCloserBriefingModule({
    leads,
    journeys,
    vault,
    clock,
    requireCloser: dashboard.requireCloser,
  });
  server.use(briefing.router);

  // F5 call-simulation: entrenador de cierre por voz. Puerto propio
  // (CallSimulatorPort), NO comparte LlmPort con F1 (regla 12, ver
  // llm.port.ts). Rate limit propio y mas estricto: cada turno cuesta tokens
  // de DeepSeek Y caracteres de Polly.
  const callSimulation = createCallSimulationModule({
    callSimulator: createCallSimulator(env),
    speech: createSpeechSynthesis(env),
    transcription: createSpeechTranscription(env),
    highlights: createCallHighlights(env),
    recordings: createCallRecordingStore(env, supabaseClient),
    sessions: new InMemoryCallSessionStore(clock),
    clock,
    ids,
  });
  server.use(simulationRateLimiter, callSimulation.router);

  server.use(notFoundHandler);
  server.use(errorHandler);

  return { server };
}
