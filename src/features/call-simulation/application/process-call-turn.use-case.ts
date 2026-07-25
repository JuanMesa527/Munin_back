/**
 * Caso de uso: procesar un turno de la llamada (lo que dijo el closer ->
 * como responde el lead simulado). Capa: application.
 *
 * GLASS-BOX: `talkingPointsUsados` NO sale de lo que reporte el LLM — se
 * calcula aqui con `domain/coverage.ts`, por coincidencia de palabras entre
 * `closerDijo` y el guion real (spec call-simulation-verdict, "Coverage
 * Reflects Actual Talking Point Usage": "not by trusting a closer-reported flag").
 */

import type { CallTurn, PersonaContext } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import { detectTalkingPointsUsados } from '../domain/coverage.js';
import { inferirGenero } from '../domain/gender.js';
import { applyDelta, INTERES_INICIAL } from '../domain/temperature.js';
import type { CallSessionStorePort } from './ports/call-session-store.port.js';
import type { CallSimulatorPort } from './ports/call-simulator.port.js';
import type { SpeechSynthesisPort } from './ports/speech-synthesis.port.js';

export interface ProcessCallTurnDeps {
  readonly callSimulator: CallSimulatorPort;
  readonly speech: SpeechSynthesisPort;
  readonly sessions: CallSessionStorePort;
  readonly clock: ClockPort;
}

export interface ProcessCallTurnInput {
  readonly callId: string;
  readonly closerDijo: string;
}

/** Misma segunda barrera anti-alucinacion que `start-call.use-case.ts`. */
function filtrarObjecionesValidas(candidatas: readonly string[], persona: PersonaContext): string[] {
  const validas = new Set(persona.objeciones.map((o) => o.pregunta));
  return candidatas.filter((candidata) => validas.has(candidata));
}

export class ProcessCallTurnUseCase {
  constructor(private readonly deps: ProcessCallTurnDeps) {}

  async execute(input: ProcessCallTurnInput): Promise<Result<CallTurn>> {
    const sesion = await this.deps.sessions.get(input.callId);
    if (!sesion.ok) {
      return sesion;
    }
    const { persona, dificultad, turnos } = sesion.value;

    const talkingPointsUsados = detectTalkingPointsUsados(input.closerDijo, persona.talkingPoints);

    const replica = await this.deps.callSimulator.nextTurn({
      persona,
      dificultad,
      historial: turnos,
      closerDijo: input.closerDijo,
    });
    if (!replica.ok) {
      // Entrada NO CONFIABLE del LLM: nunca se fabrica un turno con un delta
      // inventado (spec "LLM Output Is Untrusted Input"). El closer puede
      // reintentar el turno desde el frontend.
      return replica;
    }

    const interesAnterior = turnos.at(-1)?.interes ?? INTERES_INICIAL;
    const interes = applyDelta(interesAnterior, replica.value.deltaInteres);

    const audioResult = await this.deps.speech.synthesize({
      texto: replica.value.respuesta,
      leadId: sesion.value.leadId,
      // Misma inferencia que en `start-call`: deriva del nombre, que no
      // cambia, asi que la voz no puede alternar a mitad de llamada.
      genero: inferirGenero(persona.primerNombre),
    });

    const turno: CallTurn = {
      indice: turnos.length,
      closerDijo: input.closerDijo,
      leadRespondio: replica.value.respuesta,
      audio: audioResult.ok ? audioResult.value : null,
      mood: replica.value.mood,
      interes,
      objecionesPlanteadas: filtrarObjecionesValidas(replica.value.objecionesPlanteadas, persona),
      objecionesResueltas: filtrarObjecionesValidas(replica.value.objecionesResueltas, persona),
      talkingPointsUsados,
      ocurridoEn: this.deps.clock.now(),
    };

    const actualizada = await this.deps.sessions.appendTurn(input.callId, turno);
    if (!actualizada.ok) {
      return actualizada;
    }

    return ok(turno);
  }
}
