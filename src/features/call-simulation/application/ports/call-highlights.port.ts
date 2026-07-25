/**
 * Puerto del analista de la llamada. Capa: application (puerto LOCAL de F5).
 *
 * SEPARADO de `CallSimulatorPort` a proposito, aunque los dos hablen con el
 * mismo proveedor: interpretar a la persona turno a turno y analizar la
 * llamada terminada son trabajos distintos, con prompts distintos y con modos
 * de fallo distintos. Si el analisis se cae, el roleplay no se entera.
 *
 * GLASS-BOX (regla 12): esto redacta NARRATIVA sobre hechos ya calculados.
 * Recibe el `CallScorecard` ya cerrado — `outcome`, `puntaje` y `factores` los
 * decidio `domain/verdict.ts` — y solo explica en lenguaje humano lo que esos
 * numeros ya dicen. Un highlight jamas cambia un veredicto.
 */

import type { CallHighlights, CallScorecard, CallTurn, PersonaContext } from '@contracts';
import type { Result } from '../../../../shared/kernel/result.js';

export interface CallHighlightsInput {
  readonly persona: PersonaContext;
  readonly turnos: readonly CallTurn[];
  /** Ya calculado. El analista lo LEE, nunca lo recalcula ni lo contradice. */
  readonly scorecard: CallScorecard;
}

export interface CallHighlightsPort {
  /**
   * Analiza una llamada YA terminada.
   *
   * Nunca es una precondicion: `EndCallUseCase` degrada a `highlights: null`
   * si esto falla, igual que hace con la voz. El veredicto se muestra completo
   * sin analisis; lo que no puede pasar es quedarse sin veredicto.
   */
  analizar(input: CallHighlightsInput): Promise<Result<CallHighlights>>;
}
