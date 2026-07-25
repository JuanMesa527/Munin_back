/**
 * Composition root de F2.2 · lead-education. Capa: interface (wiring).
 *
 * Recibe PUERTOS ya construidos (nunca implementaciones concretas: eso lo elige
 * `app.ts`) y devuelve el `Router` de Express de la feature. Es el archivo por
 * el que conviene empezar a leer la feature.
 */

import type { Router } from 'express';
import type {
  ClockPort,
  DataCatalogPort,
  EducationJourneyRepository,
  IdGeneratorPort,
  LeadRepository,
} from '@shared/application/ports/index.js';
import { GetOrCreateJourneyUseCase } from './application/get-or-create-journey.use-case.js';
import { RecordProgressUseCase } from './application/record-progress.use-case.js';
import { seedDemoLeads } from './infrastructure/demo-seed.js';
import { createEducationRouter } from './interface/education.controller.js';

export { seedDemoLeads };

export interface LeadEducationModuleDeps {
  readonly journeys: EducationJourneyRepository;
  readonly leads: LeadRepository;
  readonly catalog: DataCatalogPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export interface LeadEducationModule {
  readonly router: Router;
}

export function createLeadEducationModule(deps: LeadEducationModuleDeps): LeadEducationModule {
  const getOrCreateJourney = new GetOrCreateJourneyUseCase({
    journeys: deps.journeys,
    leads: deps.leads,
    catalog: deps.catalog,
    clock: deps.clock,
  });

  const recordProgress = new RecordProgressUseCase({
    journeys: deps.journeys,
    leads: deps.leads,
    clock: deps.clock,
    ids: deps.ids,
  });

  return {
    router: createEducationRouter({ getOrCreateJourney, recordProgress, clock: deps.clock }),
  };
}
