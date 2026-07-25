/**
 * COMPOSITION ROOT del backend.
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
 *   3. rate limit + rutas de features (F1 lead-intake + F2.1 lead-enrichment)
 *   4. notFoundHandler -> 404 en formato `ApiResponse`
 *   5. errorHandler    -> ultima red, 4 argumentos
 */

import express from 'express';
import type { Express } from 'express';
import { API_ROUTES } from '@contracts';
import { createLeadIntakeModule } from './features/lead-intake/lead-intake.module.js';
import { createLeadEnrichmentModule } from './features/lead-enrichment/lead-enrichment.module.js';
import type { AppEnv } from './shared/infrastructure/config/env.js';
import { SystemClock } from './shared/infrastructure/clock/system-clock.adapter.js';
import { FileDataCatalogAdapter } from './shared/infrastructure/catalog/file-data-catalog.adapter.js';
import { errorHandler, notFoundHandler } from './shared/infrastructure/http/error-handler.js';
import { applySecurity, publicRateLimiter } from './shared/infrastructure/http/security.js';
import { createHttpLogger, logger } from './shared/infrastructure/logging/logger.js';
import { createLeadRepository } from './shared/infrastructure/persistence/persistence.factory.js';
import { seedDemoLeads } from './shared/infrastructure/persistence/demo-seed.js';
import { createSupabaseClient } from './shared/infrastructure/persistence/supabase/supabase-client.js';
import type { SwipeStorePort } from './features/lead-enrichment/application/ports/swipe-store.port.js';
import type { TelemetryStorePort } from './features/lead-enrichment/application/ports/telemetry.port.js';
import { InMemorySwipeStore } from './features/lead-enrichment/infrastructure/in-memory-swipe.store.js';
import { NoopTelemetryStore } from './features/lead-enrichment/infrastructure/noop-telemetry.store.js';
import { SupabaseSwipeStore } from './features/lead-enrichment/infrastructure/supabase-swipe.store.js';
import { SupabaseTelemetryStore } from './features/lead-enrichment/infrastructure/supabase-telemetry.store.js';

export interface App {
  readonly server: Express;
}

export async function createApp(env: AppEnv): Promise<App> {
  const server = express();

  applySecurity(server, env);
  server.use(createHttpLogger());

  // --- Adapters concretos (la unica eleccion de implementacion del backend) ---
  const clock = new SystemClock();
  // UN solo repositorio de leads, compartido por F1 y F2.1: el lead que F1 marca
  // `viable` es EXACTAMENTE el que F2.1 enriquece (handoff F1->F2.1). Sale de la
  // fabrica env-driven, asi que respeta `PERSISTENCE_DRIVER` (memory/supabase).
  const leads = createLeadRepository(env);
  const catalogo = new FileDataCatalogAdapter({
    weightsPath: env.weightsPath,
    projectProfilesPath: env.projectProfilesPath,
    projectsCatalogPath: env.projectsCatalogPath,
  });

  // Swipes y telemetria: Supabase cuando el driver lo pide, memoria/no-op si no.
  // Es la unica eleccion memoria-vs-DB de F2.1, y vive solo aqui.
  let swipes: SwipeStorePort;
  let telemetry: TelemetryStorePort;
  if (
    env.persistenceDriver === 'supabase' &&
    env.supabaseUrl !== null &&
    env.supabaseServiceRoleKey !== null
  ) {
    const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    swipes = new SupabaseSwipeStore(supabase);
    telemetry = new SupabaseTelemetryStore(supabase);
    logger.info({ driver: 'supabase' }, 'persistencia de F2.1 en Supabase');
  } else {
    swipes = new InMemorySwipeStore();
    telemetry = new NoopTelemetryStore();
    logger.info({ driver: 'memory' }, 'persistencia de F2.1 en memoria');
  }

  // Los leads de demo NUNCA se siembran en produccion: alli los leads los crea
  // F1 con consentimiento real del titular.
  if (!env.isProduction) {
    await seedDemoLeads(leads);
  }

  // --- Health check: sin rate limit, para que el PaaS no se auto-bloquee ---
  server.get(API_ROUTES.health, (_req, res) => {
    res.json({ ok: true, data: { estado: 'vivo', at: clock.now() } });
  });

  // --- Flujo publico del usuario final (sin login, autogestionado) ---
  // F1 lead-intake: comparte el MISMO `leads` que F2.1 (son un solo flujo). Su
  // router aplica su propio rate limit dentro del modulo.
  const intake = createLeadIntakeModule(env, { leads });
  server.use(intake.router);

  // F2.1 lead-enrichment: expande info del lead viable.
  const enrichment = createLeadEnrichmentModule({ leads, catalogo, clock, swipes, telemetry });
  server.use(publicRateLimiter, enrichment.router);

  // TODO: montar lead-education (F2.2), closer-dashboard (F3) y
  // closer-briefing (F4) cuando existan.

  server.use(notFoundHandler);
  server.use(errorHandler);

  return { server };
}
