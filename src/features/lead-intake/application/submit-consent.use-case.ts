/**
 * Caso de uso `/consent` de F1 (lead-intake). Capa: application. Gate legal
 * (Ley 1581) y PRIMERA escritura del `LeadProfile`: el id lo mintea el servidor
 * via `IdGeneratorPort`, nunca el cliente — evita que un `leadId` ajeno
 * sobrescriba un lead ya perfilado (OWASP A01/A04, "client-controlled
 * identifier").
 */

import type { ConsentRecord, ConversationTurn, FinalidadTratamiento } from '@contracts';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import type { IdGeneratorPort } from '@shared/application/ports/id-generator.port.js';
import type { LeadRepository } from '@shared/application/ports/lead-repository.port.js';
import { createEmptyLeadProfile } from '@shared/domain/lead.js';
import { ConsentRequiredError, ValidationError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';
import { buildBotMessage, computeProgress, getNextStep } from '../domain/conversation.js';
import { stepPromptFor } from './step-copy.js';

/** : `finalidades ⊇ perfilamiento_vivienda`. */
const FINALIDAD_REQUERIDA: FinalidadTratamiento = 'perfilamiento_vivienda';

export interface SubmitConsentDeps {
  readonly leads: LeadRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  /** `env.privacyPolicyVersion`, inyectado desde `lead-intake.module.ts`. */
  readonly activePolicyVersion: string;
}

export interface SubmitConsentInput {
  readonly otorgado: boolean;
  readonly versionPolitica: string;
  readonly finalidades: FinalidadTratamiento[];
  readonly canal: string;
}

export class SubmitConsentUseCase {
  constructor(private readonly deps: SubmitConsentDeps) {}

  async execute(input: SubmitConsentInput): Promise<Result<ConversationTurn>> {
    const consentimientoValido =
      input.otorgado &&
      input.versionPolitica === this.deps.activePolicyVersion &&
      input.finalidades.includes(FINALIDAD_REQUERIDA);

    if (!consentimientoValido) {
      // Nada se persiste: ni un `save` parcial. Spec "Consent Gate Enforced in Domain".
      return err(new ConsentRequiredError());
    }

    const now = this.deps.clock.now();
    const consentimiento: ConsentRecord = {
      otorgado: input.otorgado,
      versionPolitica: input.versionPolitica,
      finalidades: input.finalidades,
      otorgadoEn: now,
      canal: input.canal,
    };

    // El id NUNCA viene del input (D6): siempre se mintea aqui.
    const profile = {
      ...createEmptyLeadProfile(this.deps.ids.newId(), now),
      consentimiento,
    };

    const guardado = await this.deps.leads.save(profile);
    if (!guardado.ok) {
      return guardado;
    }

    const paso = getNextStep(guardado.value);
    if (paso === null) {
      // Defensivo: un perfil recien creado siempre tiene al menos un slot pendiente.
      return err(new ValidationError('No se pudo determinar el siguiente paso de la conversacion'));
    }

    const mensaje = buildBotMessage({
      id: this.deps.ids.newId(),
      texto: stepPromptFor(paso.slot),
      quickReplies: paso.quickReplies,
      now,
    });

    return ok({
      profile: guardado.value,
      mensajes: [mensaje],
      siguientePaso: paso,
      progreso: computeProgress(guardado.value),
      routing: null,
    });
  }
}
