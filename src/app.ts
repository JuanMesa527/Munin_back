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
import { createLeadEnrichmentModule } from './features/lead-enrichment/lead-enrichment.module.js';
import type { AppEnv } from './shared/infrastructure/config/env.js';
import { SystemClock } from './shared/infrastructure/clock/system-clock.adapter.js';
import { FileDataCatalogAdapter } from './shared/infrastructure/catalog/file-data-catalog.adapter.js';
import { errorHandler, notFoundHandler } from './shared/infrastructure/http/error-handler.js';
import { applySecurity, publicRateLimiter } from './shared/infrastructure/http/security.js';
import { createHttpLogger, logger } from './shared/infrastructure/logging/logger.js';
import { InMemoryLeadRepository } from './shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
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
  // Los leads siguen en memoria a proposito: los ids de demo son slugs
  // (`demo-familia-soacha`) y `lead_profiles.id` en Supabase es uuid. Persistir
  // el lead viene con F1; lo que F2.1 manda a Supabase es el catalogo, los
  // swipes y la telemetria, todos con `lead_id` de texto libre.
  const leads = new InMemoryLeadRepository();
  const catalogo = new FileDataCatalogAdapter({
    weightsPath: env.weightsPath,
    projectProfilesPath: env.projectProfilesPath,
    projectsCatalogPath: env.projectsCatalogPath,
  });

  // Swipes y telemetria: Supabase cuando el driver lo pide, memoria/no-op si no.
  // Es la unica eleccion memoria-vs-DB del backend, y vive solo aqui.
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
  const enrichment = createLeadEnrichmentModule({ leads, catalogo, clock, swipes, telemetry });
  server.use(publicRateLimiter, enrichment.router);

  // TODO: montar aqui lead-intake (F1), lead-education (F2.2),
  // closer-dashboard (F3) y closer-briefing (F4) cuando existan.

  server.use(notFoundHandler);
  server.use(errorHandler);

  return { server };
}
