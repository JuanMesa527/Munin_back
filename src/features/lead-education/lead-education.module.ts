/**
 * Composition root de F2.2 · lead-education. Capa: interface (wiring).
 *
 * Recibe PUERTOS ya construidos (nunca implementaciones concretas: eso lo elige
 * `app.ts`) y devuelve el `Router` de Express de la feature. Es el archivo por
 * el que conviene empezar a leer la feature.
 */

import type { RequestHandler, Router } from 'express';
import type {
  ClockPort,
  DataCatalogPort,
  EducationJourneyRepository,
  IdGeneratorPort,
  LeadContactLookupPort,
  LeadOtpDeliveryPort,
  LeadOtpPort,
  LeadRepository,
  LeadSessionStorePort,
} from '@shared/application/ports/index.js';
import { GetOrCreateJourneyUseCase } from './application/get-or-create-journey.use-case.js';
import { RecordProgressUseCase } from './application/record-progress.use-case.js';
import { seedDemoLeads } from './infrastructure/demo-seed.js';
import { createEducationRouter } from './interface/education.controller.js';
import { createLeadAuthRouter } from './interface/lead-auth.controller.js';
import { createRequireLead, createRequireOwnLead } from './interface/require-lead.js';

export { seedDemoLeads };

export interface LeadEducationModuleDeps {
  readonly journeys: EducationJourneyRepository;
  readonly leads: LeadRepository;
  readonly catalog: DataCatalogPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  /** Login por OTP (adenda A14): recupera el `leadId` cuando se perdio de `localStorage`. */
  readonly contactLookup: LeadContactLookupPort;
  readonly otp: LeadOtpPort;
  /** Envio real del OTP (adenda A14): `mock` o `smtp` segun `EMAIL_PROVIDER`. */
  readonly otpDelivery: LeadOtpDeliveryPort;
  readonly sessionStore: LeadSessionStorePort;
  readonly secureCookie: boolean;
  readonly sessionTtlMinutes: number;
  readonly isProduction: boolean;
}

export interface LeadEducationModule {
  readonly router: Router;
  readonly authRouter: Router;
  readonly requireLead: RequestHandler;
  /** Se monta DESPUES de `requireLead`: la sesion tiene que ser la del `leadId` pedido. */
  readonly requireOwnLead: RequestHandler;
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
    authRouter: createLeadAuthRouter({
      contactLookup: deps.contactLookup,
      otp: deps.otp,
      otpDelivery: deps.otpDelivery,
      sessionStore: deps.sessionStore,
      secureCookie: deps.secureCookie,
      sessionTtlMinutes: deps.sessionTtlMinutes,
      isProduction: deps.isProduction,
    }),
    requireLead: createRequireLead(deps.sessionStore),
    requireOwnLead: createRequireOwnLead(),
  };
}
