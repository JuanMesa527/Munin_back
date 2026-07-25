/**
 * Composition root de F1 (lead-intake). Capa: composicion (feature-level).
 * UNICO archivo, fuera de `app.ts`, que sabe que implementacion concreta usa
 * esta feature (spec lead-intake-interface "Feature Isolation via Module
 * Boundary"): nada mas debe importar `domain/`, `application/` ni
 * `interface/` de esta feature directamente — solo `{ router }`.
 *
 * NOTA (Fase 5 / D10-D11, ver tasks.md nota de la Fase 2): esta fase todavia
 * no puede depender de `persistence.factory.ts` ni del caso `'deepseek'` de
 * `llm.factory.ts` porque esos archivos son responsabilidad de la Fase 5
 * (PR apilada encima de esta, sin bloquear esta). Por eso aqui se
 * instancian `InMemoryLeadRepository` y `StubLlmAdapter` DIRECTAMENTE en vez
 * de pasar por una fabrica env-driven — la Fase 5 cambiara estas dos lineas
 * por `createLeadRepository(env)`/`createLlmPort(env)` sin tocar nada mas de
 * este modulo. No se introduce ningun puerto nuevo (config.yaml rules.design).
 */

import type { Router } from 'express';
import type { AppEnv } from '@shared/infrastructure/config/env.js';
import { FileDataCatalogAdapter } from '@shared/infrastructure/catalog/file-data-catalog.adapter.js';
import { SystemClock } from '@shared/infrastructure/clock/system-clock.adapter.js';
import { CryptoIdGenerator } from '@shared/infrastructure/id/crypto-id-generator.adapter.js';
import { InMemoryLeadRepository } from '@shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { StubLlmAdapter } from '@shared/infrastructure/llm/stub-llm.adapter.js';
import { ProcessConversationTurnUseCase } from './application/process-conversation-turn.use-case.js';
import { StartConversationUseCase } from './application/start-conversation.use-case.js';
import { SubmitConsentUseCase } from './application/submit-consent.use-case.js';
import { createIntakeRouter } from './interface/intake.controller.js';

export interface LeadIntakeModule {
  readonly router: Router;
}

export function createLeadIntakeModule(env: AppEnv): LeadIntakeModule {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const leads = new InMemoryLeadRepository();
  const llm = new StubLlmAdapter();
  const catalog = new FileDataCatalogAdapter({
    weightsPath: env.weightsPath,
    projectProfilesPath: env.projectProfilesPath,
  });

  const startConversation = new StartConversationUseCase({ clock, ids });

  const submitConsent = new SubmitConsentUseCase({
    leads,
    clock,
    ids,
    activePolicyVersion: env.privacyPolicyVersion,
  });

  const processConversationTurn = new ProcessConversationTurnUseCase({
    leads,
    catalog,
    llm,
    clock,
    ids,
    activePolicyVersion: env.privacyPolicyVersion,
  });

  const router = createIntakeRouter({ startConversation, submitConsent, processConversationTurn });

  return { router };
}
