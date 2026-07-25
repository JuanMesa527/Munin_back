/**
 * Composition root de F1 (lead-intake). Capa: composicion (feature-level).
 * UNICO archivo, fuera de `app.ts`, que sabe que implementacion concreta usa
 * esta feature (spec lead-intake-interface "Feature Isolation via Module
 * Boundary"): nada mas debe importar `domain/`, `application/` ni
 * `interface/` de esta feature directamente — solo `{ router }`.
 *
 * Fase 5 (D10/D11): `leads`/`llm` ya salen de sus fabricas env-driven
 * (`persistence.factory.ts`/`llm.factory.ts`), no de una construccion
 * directa — asi el driver de persistencia (`memory`/`supabase`) y el
 * provider de LLM (`stub`/`anthropic`/`deepseek`) son una variable de
 * entorno, nunca una eleccion hardcodeada en el modulo. No se introduce
 * ningun puerto nuevo (config.yaml rules.design).
 */

import type { Router } from 'express';
import type { AppEnv } from '@shared/infrastructure/config/env.js';
import { FileDataCatalogAdapter } from '@shared/infrastructure/catalog/file-data-catalog.adapter.js';
import { SystemClock } from '@shared/infrastructure/clock/system-clock.adapter.js';
import { CryptoIdGenerator } from '@shared/infrastructure/id/crypto-id-generator.adapter.js';
import { createLlmPort } from '@shared/infrastructure/llm/llm.factory.js';
import { createLeadRepository } from '@shared/infrastructure/persistence/persistence.factory.js';
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
  const leads = createLeadRepository(env);
  const llm = createLlmPort(env);
  const catalog = new FileDataCatalogAdapter({
    weightsPath: env.weightsPath,
    projectProfilesPath: env.projectProfilesPath,
    projectsCatalogPath: env.projectsCatalogPath,
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
