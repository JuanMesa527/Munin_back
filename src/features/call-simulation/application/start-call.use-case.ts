/**
 * Caso de uso: iniciar una llamada simulada. Capa: application.
 *
 * Recibe `PersonaContext` ya armado por el cliente (decision de diseño: los
 * leads que el closer ve en la demo no existen en `LeadRepository` — su seed
 * tiene otros ids y campos distintos — asi que cargar por `leadId` daria 404
 * para todo lead visible hoy).
 *
 * TODO F5: cuando exista un backend real de F3/F4 con `LeadRepository`
 * poblado por esos mismos ids, este caso de uso deberia recibir solo
 * `leadId`, cargar el `BriefingSheet` del repositorio y construir
 * `PersonaContext` con `domain/persona.ts#buildPersonaContext` (ya escrita y
 * testeada para ese momento), en vez de confiar en el contexto que manda el
 * cliente.
 */

import type { CallDifficulty, CallSimulationSession, CallTurn, PersonaContext } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../shared/application/ports/id-generator.port.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import { inferirGenero } from '../domain/gender.js';
import { INTERES_INICIAL, applyDelta } from '../domain/temperature.js';
import type { CallSessionStorePort } from './ports/call-session-store.port.js';
import type { CallSimulatorPort } from './ports/call-simulator.port.js';
import type { SpeechSynthesisPort } from './ports/speech-synthesis.port.js';

export interface StartCallDeps {
  readonly callSimulator: CallSimulatorPort;
  readonly speech: SpeechSynthesisPort;
  readonly sessions: CallSessionStorePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export interface StartCallInput {
  readonly leadId: string;
  readonly dificultad: CallDifficulty;
  readonly persona: PersonaContext;
}

/**
 * El LLM solo puede plantear/resolver objeciones que ya existan en el guion
 * real del lead (regla del prompt en `buildSystemPrompt`). Esta funcion es la
 * segunda barrera, server-side: cualquier texto que el modelo alucine se
 * descarta antes de que llegue al `CallTurn`.
 */
function filtrarObjecionesValidas(candidatas: readonly string[], persona: PersonaContext): string[] {
  const validas = new Set(persona.objeciones.map((o) => o.pregunta));
  return candidatas.filter((candidata) => validas.has(candidata));
}

export class StartCallUseCase {
  constructor(private readonly deps: StartCallDeps) {}

  async execute(input: StartCallInput): Promise<Result<CallSimulationSession>> {
    // `CallSimulatorPort.openCall` es quien construye el system prompt (via
    // `domain/persona.ts#buildSystemPrompt`) dentro del adapter: el caso de
    // uso no conoce el detalle de como se le habla al LLM, solo orquesta.
    const apertura = await this.deps.callSimulator.openCall({
      persona: input.persona,
      dificultad: input.dificultad,
    });
    if (!apertura.ok) {
      return apertura;
    }

    const interes = applyDelta(INTERES_INICIAL, apertura.value.deltaInteres);
    // El genero se infiere UNA vez, del primer nombre de la persona, y se
    // guarda en la sesion: asi todos los turnos suenan con la misma voz aunque
    // el historial cambie.
    const genero = inferirGenero(input.persona.primerNombre);
    const voz = this.deps.speech.voiceFor({ leadId: input.leadId, genero });
    const audioResult = await this.deps.speech.synthesize({
      texto: apertura.value.respuesta,
      leadId: input.leadId,
      genero,
    });

    const turno: CallTurn = {
      indice: 0,
      closerDijo: '',
      leadRespondio: apertura.value.respuesta,
      // Nunca bloquea el arranque de la llamada: audio es un enriquecimiento.
      audio: audioResult.ok ? audioResult.value : null,
      mood: apertura.value.mood,
      interes,
      objecionesPlanteadas: filtrarObjecionesValidas(apertura.value.objecionesPlanteadas, input.persona),
      objecionesResueltas: filtrarObjecionesValidas(apertura.value.objecionesResueltas, input.persona),
      talkingPointsUsados: [],
      ocurridoEn: this.deps.clock.now(),
    };

    const callId = this.deps.ids.newId();
    const iniciadaEn = this.deps.clock.now();

    const creada = await this.deps.sessions.create({
      callId,
      leadId: input.leadId,
      dificultad: input.dificultad,
      persona: input.persona,
      voz,
      turnos: [turno],
      audiosCloser: [],
      iniciadaEn,
    });
    if (!creada.ok) {
      return creada;
    }

    return ok({
      callId,
      leadId: input.leadId,
      dificultad: input.dificultad,
      voz,
      apertura: turno,
      interes,
      iniciadaEn,
    });
  }
}
