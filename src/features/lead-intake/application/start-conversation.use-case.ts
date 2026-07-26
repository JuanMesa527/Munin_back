/**
 * Caso de uso `/start` de F1 (lead-intake). Capa: application.: devuelve un
 * `LeadProfile` EFIMERO y NO persistido (D6) — solo para que la UI pueda
 * renderizar el saludo y el gate de consentimiento. `/consent` mintea el id
 * real y hace la primera escritura.
 */

import type { ConversationStep, ConversationTurn } from '@contracts';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import type { IdGeneratorPort } from '@shared/application/ports/id-generator.port.js';
import { createEmptyLeadProfile } from '@shared/domain/lead.js';
import type { Result } from '@shared/kernel/result.js';
import { ok } from '@shared/kernel/result.js';
import { buildBotMessage, computeProgress } from '../domain/conversation.js';

const TEXTO_SALUDO =
  'Hola, soy el asistente de perfilamiento de vivienda de Colsubsidio. Antes de continuar, necesito tu consentimiento para tratar tus datos personales.';

/**
 * `getNextStep` (domain, Fase 1) solo modela los 6 pasos de PREGUNTA — el
 * gate de consentimiento no es un `Slot`, asi que este paso se construye
 * aqui, en `application/`, y no en el dominio.
 */
const PASO_CONSENTIMIENTO: ConversationStep = {
  id: 'consentimiento',
  slot: null,
  tipo: 'consentimiento',
  permiteTextoLibre: false,
  quickReplies: [
    { label: 'Acepto', value: 'true' },
    { label: 'No acepto', value: 'false' },
  ],
};

export interface StartConversationDeps {
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export class StartConversationUseCase {
  constructor(private readonly deps: StartConversationDeps) {}

  execute(): Promise<Result<ConversationTurn>> {
    const now = this.deps.clock.now();
    const profile = createEmptyLeadProfile(this.deps.ids.newId(), now);

    const mensaje = buildBotMessage({
      id: this.deps.ids.newId(),
      texto: TEXTO_SALUDO,
      quickReplies: PASO_CONSENTIMIENTO.quickReplies,
      now,
    });

    return Promise.resolve(
      ok({
        profile,
        mensajes: [mensaje],
        siguientePaso: PASO_CONSENTIMIENTO,
        progreso: computeProgress(profile),
        routing: null,
      }),
    );
  }
}
