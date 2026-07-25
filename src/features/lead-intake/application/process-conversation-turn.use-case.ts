/**
 * Caso de uso `/turn` de F1 (lead-intake). Capa: application.
 * Orquesta el loop de slots y las TRES salidas de carril persistidas
 * (`viable` | `no_viable` | `null`, design.md D3/D4) — todas por el MISMO
 * `LeadRepository.save`. El LLM solo entra cuando el parser puro
 * (`parseAnswer`, domain) falla con texto libre, y su salida vuelve a pasar
 * por ese mismo parser antes de tocar `updateProfile` (D1).
 */

import type { ConversationTurn, IsoDateTime, LeadProfile } from '@contracts';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import type { DataCatalogPort } from '@shared/application/ports/data-catalog.port.js';
import type { IdGeneratorPort } from '@shared/application/ports/id-generator.port.js';
import type { LeadRepository } from '@shared/application/ports/lead-repository.port.js';
import type { LlmPort } from '@shared/application/ports/llm.port.js';
import { hasConsent } from '@shared/domain/lead.js';
import { ConsentRequiredError, ValidationError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';
import {
  buildBotMessage,
  computeProgress,
  getNextStep,
  isReadyToRoute,
  parseAnswer,
  updateProfile,
} from '../domain/conversation.js';
import { filterByEligibility, matchProjects } from '../domain/matching.js';
import { checkAffiliation, estimateCapacity, scoreLead } from '../domain/profiling.js';
import { decideViability } from '../domain/routing.js';
import { stepPromptFor } from './step-copy.js';

/** Confianza minima del LLM para aceptar su extraccion (design.md D1). Placeholder documentado. */
const CONFIANZA_MINIMA_LLM = 0.5;

const TEXTO_NO_ENTENDIDO = 'No logré entender tu respuesta, ¿podrías intentarlo de nuevo?';
const TEXTO_SIN_CLASIFICAR =
  'Gracias por tu tiempo. Todavía no podemos calcular tu perfil con los datos disponibles; te contactaremos pronto.';

export interface ProcessConversationTurnDeps {
  readonly leads: LeadRepository;
  readonly catalog: DataCatalogPort;
  readonly llm: LlmPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  /** `env.privacyPolicyVersion`, inyectado desde `lead-intake.module.ts` (design.md D2). */
  readonly activePolicyVersion: string;
}

export interface ProcessConversationTurnInput {
  readonly leadId: string;
  readonly texto: string | null;
  readonly quickReplyValue: string | null;
}

export class ProcessConversationTurnUseCase {
  constructor(private readonly deps: ProcessConversationTurnDeps) {}

  async execute(input: ProcessConversationTurnInput): Promise<Result<ConversationTurn>> {
    const encontrado = await this.deps.leads.findById(input.leadId);
    if (!encontrado.ok) {
      return encontrado;
    }
    const profile = encontrado.value;

    if (!hasConsent(profile, this.deps.activePolicyVersion)) {
      // Gate legal: ni un slot mas se procesa ni se guarda nada sin consentimiento vigente.
      return err(new ConsentRequiredError());
    }

    const paso = getNextStep(profile);
    if (paso === null) {
      return this.finalize(profile);
    }
    if (paso.slot === null) {
      // Defensivo: `getNextStep` solo produce pasos `tipo: 'pregunta'` con slot no-nulo.
      return err(new ValidationError('Paso de conversacion invalido'));
    }
    const slot = paso.slot;

    const respuestaCruda = input.quickReplyValue ?? input.texto;
    if (respuestaCruda === null) {
      return err(new ValidationError('Se requiere una respuesta', { respuesta: 'requerido' }));
    }

    let parseado = parseAnswer(slot, respuestaCruda);

    // D1: el LLM solo entra cuando el parser puro fallo Y la respuesta vino
    // como texto libre (un quick reply ya es vocabulario cerrado — no hay
    // ambiguedad que resolver con el modelo).
    if (!parseado.ok && input.quickReplyValue === null && input.texto !== null) {
      const extraccion = await this.deps.llm.extractSlotValue({
        texto: input.texto,
        slot,
        contexto: contextoParaSlot(paso.quickReplies),
      });
      if (
        extraccion.ok &&
        extraccion.value.valor !== null &&
        extraccion.value.confianza >= CONFIANZA_MINIMA_LLM
      ) {
        // La salida del LLM es entrada NO CONFIABLE: vuelve a pasar por el
        // MISMO parser puro antes de entrar al dominio (D1, regla 22).
        parseado = parseAnswer(slot, extraccion.value.valor);
      }
    }

    if (!parseado.ok) {
      const mensaje = buildBotMessage({
        id: this.deps.ids.newId(),
        texto: TEXTO_NO_ENTENDIDO,
        quickReplies: paso.quickReplies,
        now: this.deps.clock.now(),
      });
      return ok({
        profile,
        mensajes: [mensaje],
        siguientePaso: paso,
        progreso: computeProgress(profile),
        routing: null,
      });
    }

    const actualizado = updateProfile(profile, parseado.value, this.deps.clock.now());

    if (!isReadyToRoute(actualizado)) {
      const guardado = await this.deps.leads.save(actualizado);
      if (!guardado.ok) {
        return guardado;
      }
      const siguientePaso = getNextStep(guardado.value);
      const mensaje = buildBotMessage({
        id: this.deps.ids.newId(),
        texto: stepPromptFor(siguientePaso?.slot ?? null),
        quickReplies: siguientePaso?.quickReplies ?? [],
        now: this.deps.clock.now(),
      });
      return ok({
        profile: guardado.value,
        mensajes: [mensaje],
        siguientePaso,
        progreso: computeProgress(guardado.value),
        routing: null,
      });
    }

    return this.finalize(actualizado);
  }

  /**
   * Perfilamiento + matching + enrutamiento (design.md Data Flow, D3/D4).
   * Cualquier fallo aguas abajo de este punto (catalogo indisponible, sin
   * factores observables, sin evidencia para `decideViability`) degrada de
   * forma honesta a `finalizeUnclassified` — nunca fabrica un carril.
   */
  private async finalize(profile: LeadProfile): Promise<Result<ConversationTurn>> {
    const now = this.deps.clock.now();

    const [pesos, proyectos] = await Promise.all([
      this.deps.catalog.getWeights(),
      this.deps.catalog.getProjectProfiles(),
    ]);
    if (!pesos.ok || !proyectos.ok) {
      return this.finalizeUnclassified(profile, now);
    }

    const capacidad = estimateCapacity(profile);
    if (!capacidad.ok) {
      return this.finalizeUnclassified(profile, now);
    }

    const score = scoreLead(profile, pesos.value, now);
    if (!score.ok) {
      return this.finalizeUnclassified(profile, now);
    }

    const afiliacion = checkAffiliation(profile);
    const elegibles = filterByEligibility(proyectos.value, profile, capacidad.value);
    const matches = matchProjects(elegibles, profile);

    const routing = decideViability({
      score: score.value,
      capacidad: capacidad.value,
      afiliacion,
      umbralViable: pesos.value.umbralViable,
      now,
    });
    if (routing === null) {
      return this.finalizeUnclassified(profile, now);
    }

    const perfilFinal: LeadProfile = {
      ...profile,
      capacidad: capacidad.value,
      score: score.value,
      proyectos: matches,
      carril: routing.carril,
      updatedAt: now,
    };

    const guardado = await this.deps.leads.save(perfilFinal);
    if (!guardado.ok) {
      return guardado;
    }

    const explicacion = await this.explicacionMejorEsfuerzo(routing.explicacion, {
      score: String(score.value.valor),
      carril: routing.carril,
    });

    const mensaje = buildBotMessage({
      id: this.deps.ids.newId(),
      texto: explicacion,
      quickReplies: [],
      now,
    });

    return ok({
      profile: guardado.value,
      mensajes: [mensaje],
      siguientePaso: null,
      progreso: computeProgress(guardado.value),
      routing,
    });
  }

  /**
   * D3: `carril: null` (expresado como `routing: null`) es una salida
   * HONESTA, no un error. Persiste por el MISMO `LeadRepository.save` que
   * viable/no_viable y nunca inventa un score.
   */
  private async finalizeUnclassified(
    profile: LeadProfile,
    now: IsoDateTime,
  ): Promise<Result<ConversationTurn>> {
    const perfilFinal: LeadProfile = {
      ...profile,
      capacidad: null,
      score: null,
      proyectos: [],
      carril: null,
      updatedAt: now,
    };

    const guardado = await this.deps.leads.save(perfilFinal);
    if (!guardado.ok) {
      return guardado;
    }

    const mensaje = buildBotMessage({
      id: this.deps.ids.newId(),
      texto: TEXTO_SIN_CLASIFICAR,
      quickReplies: [],
      now,
    });

    return ok({
      profile: guardado.value,
      mensajes: [mensaje],
      siguientePaso: null,
      progreso: computeProgress(guardado.value),
      routing: null,
    });
  }

  /**
   * `writeExplanation` es best-effort (design.md Open Questions): NUNCA
   * bloquea el cierre del turno. Si falla, no valida, o el adapter llega a
   * lanzar, el texto determinista de `decideViability` ya es explicable por
   * si solo (glass-box, regla 21).
   */
  private async explicacionMejorEsfuerzo(
    textoDeterminista: string,
    hechos: Record<string, string>,
  ): Promise<string> {
    try {
      const redactado = await this.deps.llm.writeExplanation({ hechos, intencion: 'razon_carril' });
      if (redactado.ok && redactado.value.trim().length > 0) {
        return redactado.value;
      }
    } catch {
      // Best-effort: un fallo de red/adapter no debe tumbar el cierre del turno.
    }
    return textoDeterminista;
  }
}

function contextoParaSlot(quickReplies: readonly { value: string }[]): string {
  if (quickReplies.length === 0) {
    return 'Respuesta de texto libre, sin vocabulario cerrado.';
  }
  return `Vocabulario permitido: ${quickReplies.map((qr) => qr.value).join(', ')}`;
}
