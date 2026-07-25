/**
 * Composition root de F2.1. Es lo UNICO que `app.ts` conoce de esta feature.
 *
 * Recibe los puertos ya construidos (incluidos el store de swipes y el sink de
 * telemetria, que ahora ELIGE `app.ts` segun el driver de persistencia). Antes
 * la feature fijaba el store in-memory por su cuenta; se movio la eleccion al
 * composition root global para que memoria-vs-Supabase se decida en un solo
 * lugar, igual que el resto de las implementaciones.
 */

import type { Router } from 'express';
import type { ClockPort } from '../../shared/application/ports/clock.port.js';
import type { DataCatalogPort } from '../../shared/application/ports/data-catalog.port.js';
import type { EducationJourneyRepository } from '../../shared/application/ports/education-repository.port.js';
import type { LeadRepository } from '../../shared/application/ports/lead-repository.port.js';
import { BuildDeckUseCase } from './application/build-deck.use-case.js';
import { CloseEnrichmentUseCase } from './application/close-enrichment.use-case.js';
import { RecordSwipeUseCase } from './application/record-swipe.use-case.js';
import { RecordTelemetryUseCase } from './application/record-telemetry.use-case.js';
import type { SwipeStorePort } from './application/ports/swipe-store.port.js';
import type { TelemetryStorePort } from './application/ports/telemetry.port.js';
import { createLeadEnrichmentRouter } from './interface/lead-enrichment.controller.js';

export interface LeadEnrichmentModuleDeps {
  readonly leads: LeadRepository;
  readonly catalogo: DataCatalogPort;
  readonly clock: ClockPort;
  readonly swipes: SwipeStorePort;
  readonly telemetry: TelemetryStorePort;
  /** Puerto compartido con F2.2/F4: aporta el hito de nutricion del recorrido. */
  readonly journeys: EducationJourneyRepository;
}

export interface LeadEnrichmentModule {
  readonly router: Router;
}

export function createLeadEnrichmentModule(
  deps: LeadEnrichmentModuleDeps,
): LeadEnrichmentModule {
  return {
    router: createLeadEnrichmentRouter({
      buildDeck: new BuildDeckUseCase(deps),
      recordSwipe: new RecordSwipeUseCase({
        swipes: deps.swipes,
        catalogo: deps.catalogo,
        clock: deps.clock,
        leads: deps.leads,
      }),
      closeEnrichment: new CloseEnrichmentUseCase({
        leads: deps.leads,
        catalogo: deps.catalogo,
        clock: deps.clock,
        swipes: deps.swipes,
        journeys: deps.journeys,
      }),
      recordTelemetry: new RecordTelemetryUseCase({ telemetry: deps.telemetry }),
    }),
  };
}
