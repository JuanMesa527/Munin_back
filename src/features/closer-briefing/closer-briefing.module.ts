import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ClockPort } from '../../shared/application/ports/clock.port.js';
import type { ContactVaultPort } from '../../shared/application/ports/contact-vault.port.js';
import type { EducationJourneyRepository } from '../../shared/application/ports/education-repository.port.js';
import type { LeadRepository } from '../../shared/application/ports/lead-repository.port.js';
import { BuildBriefingUseCase } from './application/build-briefing.use-case.js';
import { RevealContactUseCase } from './application/reveal-contact.use-case.js';
import { createCloserBriefingRouter } from './interface/closer-briefing.controller.js';

export interface CloserBriefingModuleDeps {
  readonly leads: LeadRepository;
  readonly journeys: EducationJourneyRepository;
  readonly vault: ContactVaultPort;
  readonly clock: ClockPort;
  readonly requireCloser: RequestHandler;
}

export interface CloserBriefingModule {
  readonly router: Router;
}

export function createCloserBriefingModule(deps: CloserBriefingModuleDeps): CloserBriefingModule {
  const router = Router();
  // Nunca convertir este guard en middleware global: F1/F2.1 son publicos.
  router.use('/api/closer', deps.requireCloser);
  router.use(
    createCloserBriefingRouter({
      buildBriefing: new BuildBriefingUseCase(deps.leads, deps.journeys, deps.clock),
      revealContact: new RevealContactUseCase(deps.leads, deps.vault),
    }),
  );
  return { router };
}
