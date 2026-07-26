/**
 * Puerto del roleplay de voz. Capa: application (puerto LOCAL de F5).
 *
 * GLASS-BOX — igual disciplina que `shared/application/ports/llm.port.ts`, pero
 * un puerto NUEVO y separado a proposito: `llm.port.ts` prohibe explicitamente
 * agregarle un tercer metodo ("PROHIBIDO agregar aqui un metodo que puntue,
 * clasifique, ordene, decida"). Interpretar a una persona en una llamada es una
 * tercera capacidad que ese contrato nunca prometio cubrir.
 *
 * Este puerto SOLO interpreta: nunca decide `CallOutcome` ni `puntaje`. Eso lo
 * calcula `domain/verdict.ts`, puro y sin LLM, a partir de la senal que estos
 * metodos reportan turno a turno.
 */

import type { CallDifficulty, CallMood, CallTurn, PersonaContext } from '@contracts';
import type { Result } from '../../../../shared/kernel/result.js';

/** Senal cruda de un turno de roleplay, antes de que el caso de uso la procese. */
export interface CallSimulatorTurnResult {
  respuesta: string;
  mood: CallMood;
  /** -20..20. `temperature.ts` lo aplica y clampa; este puerto no clampa nada. */
  deltaInteres: number;
  /** Texto identico a alguna `PersonaContext.objeciones[].pregunta`, nunca inventado. */
  objecionesPlanteadas: string[];
  objecionesResueltas: string[];
}

export interface CallSimulatorPort {
  /** Primera replica del lead simulado, ANTES de que el closer diga nada. */
  openCall(input: {
    persona: PersonaContext;
    dificultad: CallDifficulty;
  }): Promise<Result<CallSimulatorTurnResult>>;

  /**
   * Replica a lo que el closer acaba de decir. `historial` es de solo lectura:
   * el adapter lo usa como contexto de conversacion, nunca lo muta.
   */
  nextTurn(input: {
    persona: PersonaContext;
    dificultad: CallDifficulty;
    historial: readonly CallTurn[];
    closerDijo: string;
  }): Promise<Result<CallSimulatorTurnResult>>;
}
