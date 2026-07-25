/**
 * COMPOSITION ROOT del backend.
 *
 * Este es el UNICO archivo que sabe que implementacion concreta se usa. Cambiar
 * memoria por PostgreSQL, o el stub de LLM por Anthropic, se hace aqui y en
 * ningun otro lado: los casos de uso solo conocen puertos. Ese desacople es el
 * argumento del slide de integracion a producto.
 *
 * ORDEN DE LOS MIDDLEWARE (no lo cambies sin leer `security.ts`):
 *   1. applySecurity   -> cabeceras, CORS, parser de JSON con techo
 *   2. httpLogger      -> despues de las cabeceras, antes de las rutas, con
 *                         redaccion de PII ya configurada
 *   3. rate limit + rutas de features
 *   4. notFoundHandler -> 404 en formato `ApiResponse`
 *   5. errorHandler    -> ultima red, 4 argumentos
 */

import express from 'express';
import type { Express } from 'express';
import { API_ROUTES } from '@contracts';
import { createCloserBriefingModule } from './features/closer-briefing/closer-briefing.module.js';
import { createCloserDashboardModule } from './features/closer-dashboard/closer-dashboard.module.js';
import { EnvCloserAuthAdapter } from './features/closer-dashboard/infrastructure/env-closer-auth.adapter.js';
import { createLeadEnrichmentModule } from './features/lead-enrichment/lead-enrichment.module.js';
import type { SwipeStorePort } from './features/lead-enrichment/application/ports/swipe-store.port.js';
import type { TelemetryStorePort } from './features/lead-enrichment/application/ports/telemetry.port.js';
import { InMemorySwipeStore } from './features/lead-enrichment/infrastructure/in-memory-swipe.store.js';
import { NoopTelemetryStore } from './features/lead-enrichment/infrastructure/noop-telemetry.store.js';
import { SupabaseSwipeStore } from './features/lead-enrichment/infrastructure/supabase-swipe.store.js';
import { SupabaseTelemetryStore } from './features/lead-enrichment/infrastructure/supabase-telemetry.store.js';
import type { LeadRepository } from './shared/application/ports/lead-repository.port.js';
import type { AppEnv } from './shared/infrastructure/config/env.js';
import { PinoAuditLogAdapter } from './shared/infrastructure/audit/pino-audit-log.adapter.js';
import { SystemClock } from './shared/infrastructure/clock/system-clock.adapter.js';
import { FileDataCatalogAdapter } from './shared/infrastructure/catalog/file-data-catalog.adapter.js';
import { errorHandler, notFoundHandler } from './shared/infrastructure/http/error-handler.js';
import {
  applySecurity,
  authRateLimiter,
  publicRateLimiter,
} from './shared/infrastructure/http/security.js';
import { CryptoIdGenerator } from './shared/infrastructure/id/crypto-id-generator.adapter.js';
import { createHttpLogger, logger } from './shared/infrastructure/logging/logger.js';
import { InMemoryEducationRepository } from './shared/infrastructure/persistence/in-memory/in-memory-education.repository.js';
import { InMemoryLeadRepository } from './shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { InMemorySessionStore } from './shared/infrastructure/persistence/in-memory/in-memory-session.store.js';
import { seedDemoLeads } from './shared/infrastructure/persistence/demo-seed.js';
import { createSupabaseClient } from './shared/infrastructure/persistence/supabase/supabase-client.js';
import { SupabaseLeadRepository } from './shared/infrastructure/persistence/supabase/supabase-lead.repository.js';
import { InMemoryContactVaultAdapter } from './shared/infrastructure/security/in-memory-contact-vault.adapter.js';

export interface App {
  readonly server: Express;
}

export async function createApp(env: AppEnv): Promise<App> {
  const server = express();

  applySecurity(server, env);
  server.use(createHttpLogger());

  // --- Adapters concretos (la unica eleccion de implementacion del backend) ---
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const audit = new PinoAuditLogAdapter();
  const vault = new InMemoryContactVaultAdapter({ ids, clock, audit });
  const journeys = new InMemoryEducationRepository();
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
  const catalogo = new FileDataCatalogAdapter({
    weightsPath: env.weightsPath,
    projectProfilesPath: env.projectProfilesPath,
    projectsCatalogPath: env.projectsCatalogPath,
  });

  let leads: LeadRepository;
  let swipes: SwipeStorePort;
  let telemetry: TelemetryStorePort;
  if (
    env.persistenceDriver === 'supabase' &&
    env.supabaseUrl !== null &&
    env.supabaseServiceRoleKey !== null
  ) {
    const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    leads = new SupabaseLeadRepository(supabase);
    swipes = new SupabaseSwipeStore(supabase);
    telemetry = new SupabaseTelemetryStore(supabase);
    logger.info({ driver: 'supabase' }, 'persistencia en Supabase');
  } else {
    leads = new InMemoryLeadRepository();
    swipes = new InMemorySwipeStore();
    telemetry = new NoopTelemetryStore();
    logger.info({ driver: 'memory' }, 'persistencia en memoria');
  }

  // Los leads de demo NUNCA se siembran en produccion: alli los leads los crea
  // F1 con consentimiento real del titular.
  if (!env.isProduction) {
    await seedDemoLeads(leads, vault);
  }

  // --- Health check: sin rate limit, para que el PaaS no se auto-bloquee ---
  server.get(API_ROUTES.health, (_req, res) => {
    res.json({ ok: true, data: { estado: 'vivo', at: clock.now() } });
  });

  // --- Flujo publico del usuario final (sin login, autogestionado) ---
  const enrichment = createLeadEnrichmentModule({ leads, catalogo, clock, swipes, telemetry });
  server.use(publicRateLimiter, enrichment.router);

  // --- Login publico; el resto de las rutas closer exige sesion verificada ---
  const dashboard = createCloserDashboardModule({
    auth,
    sessionStore,
    secureCookie: env.isProduction,
    sessionTtlMinutes: env.closerSessionTtlMinutes,
    leads,
  });
  server.use(authRateLimiter, dashboard.publicRouter);
  server.use(dashboard.requireCloser, dashboard.protectedRouter);

  const briefing = createCloserBriefingModule({
    leads,
    journeys,
    vault,
    clock,
    requireCloser: dashboard.requireCloser,
  });
  server.use(briefing.router);

  server.use(notFoundHandler);
  server.use(errorHandler);

  return { server };
}
