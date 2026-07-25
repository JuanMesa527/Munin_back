/**
 * Caso de uso `/turn` de F1 (lead-intake). Capa: application.
 * Orquesta el loop de slots y las TRES salidas de carril persistidas
 * (`viable` | `no_viable` | `null`, design.md D3/D4) — todas por el MISMO
 * `LeadRepository.save`.
 *
 * - Chip: parser puro del slot actual (sin LLM).
 * - Texto libre: `llm.converseIntake` puede llenar N slots; cada valor vuelve
 *   a pasar por `parseAnswer` + `updateProfile` (D1 / glass-box).
 */

import type { ConversationTurn, IsoDateTime, LeadProfile, Slot } from '@contracts';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import type { ContactVaultPort } from '@shared/application/ports/contact-vault.port.js';
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
  listPendingAskedSlots,
  parseAnswer,
  updateProfile,
  vocabularyForAskedSlot,
} from '../domain/conversation.js';
import { filterByEligibility, matchProjects } from '../domain/matching.js';
import { checkAffiliation, estimateCapacity, scoreLead } from '../domain/profiling.js';
import { decideViability } from '../domain/routing.js';
import { stepPromptFor } from './step-copy.js';

/** Confianza minima del LLM para aceptar su extraccion (design.md D1). */
const CONFIANZA_MINIMA_LLM = 0.5;

const TEXTO_NO_ENTENDIDO =
  'No logré entender tu respuesta. ¿Podrías contarme un poco más o usar una de las opciones?';
const TEXTO_SIN_CLASIFICAR =
  'Gracias por tu tiempo. Todavía no podemos calcular tu perfil con los datos disponibles; te contactaremos pronto.';

export interface ProcessConversationTurnDeps {
  readonly leads: LeadRepository;
  readonly catalog: DataCatalogPort;
  readonly llm: LlmPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  /**
   * Boveda de contacto. Tiene que ser LA MISMA instancia que usa F4: el token
   * que se emite aqui es el que el closer canjea al revelar el telefono.
   */
  readonly vault: ContactVaultPort;
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
      return err(new ConsentRequiredError());
    }

    const paso = getNextStep(profile);
    if (paso === null) {
      return this.finalize(profile);
    }
    if (paso.slot === null) {
      return err(new ValidationError('Paso de conversacion invalido'));
    }

    if (input.quickReplyValue !== null) {
      return this.procesarChip(profile, paso.slot, input.quickReplyValue);
    }

    if (input.texto !== null) {
      return this.procesarTextoLibre(profile, paso.slot, input.texto);
    }

    return err(new ValidationError('Se requiere una respuesta', { respuesta: 'requerido' }));
  }

  /** Atajo determinista: un solo slot, sin LLM. */
  private async procesarChip(
    profile: LeadProfile,
    slot: Slot,
    valor: string,
  ): Promise<Result<ConversationTurn>> {
    const parseado = parseAnswer(slot, valor);
    if (!parseado.ok) {
      const paso = getNextStep(profile);
      const mensaje = buildBotMessage({
        id: this.deps.ids.newId(),
        texto: TEXTO_NO_ENTENDIDO,
        quickReplies: paso?.quickReplies ?? [],
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
    return this.persistirYContinuar(actualizado, null);
  }

  /**
   * Camino conversacional: DeepSeek puede llenar varios slots pendientes;
   * cada valor se revalida con `parseAnswer` antes de entrar al dominio.
   */
  private async procesarTextoLibre(
    profile: LeadProfile,
    slotActual: Slot,
    texto: string,
  ): Promise<Result<ConversationTurn>> {
    const pendientes = listPendingAskedSlots(profile);
    const vocabulario: Record<string, readonly string[]> = {};
    for (const slot of pendientes) {
      vocabulario[slot] = vocabularyForAskedSlot(slot);
    }

    const conversacion = await this.deps.llm.converseIntake({
      texto,
      slotsPendientes: pendientes,
      perfilParcial: perfilParcialParaLlm(profile),
      vocabulario,
    });

    let actualizado = profile;
    let llenoAlgo = false;
    /** Solo usamos `respuestaBot` del LLM si el modelo realmente extrajo algo. */
    let llenoViaLlm = false;

    if (conversacion.ok) {
      const ordenPendiente = new Map(pendientes.map((slot, indice) => [slot, indice]));
      const ordenadas = [...conversacion.value.extracciones]
        .filter((item) => item.confianza >= CONFIANZA_MINIMA_LLM)
        .sort(
          (a, b) => (ordenPendiente.get(a.slot) ?? 99) - (ordenPendiente.get(b.slot) ?? 99),
        );

      for (const item of ordenadas) {
        const parseado = parseAnswer(item.slot, item.valor);
        if (!parseado.ok) {
          continue;
        }
        actualizado = updateProfile(actualizado, parseado.value, this.deps.clock.now());
        llenoAlgo = true;
        llenoViaLlm = true;
      }
    }

    // Fallback: si el modelo no aporto nada util, intenta el parser puro del
    // slot actual (p. ej. el usuario escribio "Sí", "Ana" o "Bogotá").
    // IMPORTANTE: no reutilizar `respuestaBot` del stub/LLM en este camino —
    // el stub siempre dice "No logré entender…" aunque el parser haya avanzado.
    if (!llenoAlgo) {
      const directo = parseAnswer(slotActual, texto);
      if (directo.ok) {
        actualizado = updateProfile(profile, directo.value, this.deps.clock.now());
        llenoAlgo = true;
      }
    }

    if (!llenoAlgo) {
      const paso = getNextStep(profile);
      const textoBot =
        conversacion.ok && conversacion.value.respuestaBot.trim().length > 0
          ? conversacion.value.respuestaBot
          : TEXTO_NO_ENTENDIDO;
      const mensaje = buildBotMessage({
        id: this.deps.ids.newId(),
        texto: textoBot,
        quickReplies: paso?.quickReplies ?? [],
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

    const respuestaBot =
      llenoViaLlm &&
      conversacion.ok &&
      conversacion.value.respuestaBot.trim().length > 0
        ? conversacion.value.respuestaBot
        : null;

    return this.persistirYContinuar(actualizado, respuestaBot);
  }

  /**
   * TODA escritura de F1 pasa por aqui, no por `leads.save` directo.
   *
   * El motivo es la tokenizacion de abajo: un `leads.save` suelto guarda el
   * lead con `identidad = null`, y ese lead le llega al closer como "Lead sin
   * nombre" y sin telefono que revelar. Es un fallo silencioso — nada explota,
   * simplemente el dato no esta — asi que el unico modo de no repetirlo es que
   * no exista otra puerta.
   */
  private async guardar(profile: LeadProfile): Promise<Result<LeadProfile>> {
    const conIdentidad = await this.tokenizarContacto(profile);
    if (!conIdentidad.ok) {
      return conIdentidad;
    }
    return this.deps.leads.save(conIdentidad.value);
  }

  /**
   * Cambia el contacto declarado por una `ContactIdentity` tokenizada.
   *
   * F1 captura `nombre` y `telefono` como slots planos, pero lo que circula
   * hacia F3/F4 es `identidad`: nombre + telefono ENMASCARADO + token opaco
   * (minimizacion de datos, Ley 1581 art. 4). Sin este paso el vault nunca
   * recibe el dato real y `RevealContactUseCase` no tiene token que canjear.
   *
   * Se hace una sola vez por lead (`identidad !== null` corta) para no emitir
   * un token nuevo en cada turno de la conversacion.
   */
  private async tokenizarContacto(profile: LeadProfile): Promise<Result<LeadProfile>> {
    if (profile.identidad !== null) {
      return ok(profile);
    }
    // Todavia no estan los dos slots: se guarda el perfil como esta y se
    // tokenizara en el turno que complete el par.
    if (profile.nombre === null || profile.telefono === null) {
      return ok(profile);
    }

    const identidad = await this.deps.vault.store({
      nombre: profile.nombre,
      telefono: profile.telefono,
    });
    if (!identidad.ok) {
      return identidad;
    }

    return ok({ ...profile, identidad: identidad.value });
  }

  private async persistirYContinuar(
    profile: LeadProfile,
    respuestaBot: string | null,
  ): Promise<Result<ConversationTurn>> {
    if (isReadyToRoute(profile)) {
      return this.finalize(profile);
    }

    const guardado = await this.guardar(profile);
    if (!guardado.ok) {
      return guardado;
    }

    const siguientePaso = getNextStep(guardado.value);
    const texto =
      respuestaBot !== null && respuestaBot.trim().length > 0
        ? respuestaBot
        : stepPromptFor(siguientePaso?.slot ?? null);

    const mensaje = buildBotMessage({
      id: this.deps.ids.newId(),
      texto,
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

  /**
   * Perfilamiento + matching + enrutamiento (design.md Data Flow, D3/D4).
   * Cualquier fallo aguas abajo de este punto degrada de forma honesta a
   * `finalizeUnclassified` — nunca fabrica un carril.
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

    const guardado = await this.guardar(perfilFinal);
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

    const guardado = await this.guardar(perfilFinal);
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

/** Solo slots ya capturados — sin telefono, nombre ni ids. */
function perfilParcialParaLlm(profile: LeadProfile): Record<string, string> {
  const parcial: Record<string, string> = {};
  if (profile.esAfiliado !== null) {
    parcial.afiliacion = profile.esAfiliado ? 'true' : 'false';
  }
  if (profile.rangoSalarial !== null) {
    parcial.rangoSalarial = profile.rangoSalarial;
  }
  if (profile.segmentoFamiliar !== null) {
    parcial.segmentoFamiliar = profile.segmentoFamiliar;
  }
  if (profile.ciudad !== null) {
    parcial.ciudad = profile.ciudad;
  }
  if (profile.ahorroDeclarado !== null) {
    parcial.ahorro = String(profile.ahorroDeclarado);
  }
  if (profile.capacidadAhorroMensual !== null) {
    parcial.capacidadAhorroMensual = String(profile.capacidadAhorroMensual);
  }
  return parcial;
}
