/**
 * Puerto de sintesis de voz. Capa: application (puerto LOCAL de F5).
 *
 * Nunca es una precondicion para que la llamada avance:
 * `ProcessCallTurnUseCase` degrada a `audio: null` si este puerto falla. La voz
 * es un enriquecimiento, el texto es la fuente de verdad.
 */

import type { CallTurnAudio, SimulatedVoice } from '@contracts';
import type { GeneroInferido } from '../../domain/gender.js';
import type { Result } from '../../../../shared/kernel/result.js';

/**
 * Lo minimo para elegir voz. Viaja el GENERO ya inferido, no el nombre: la
 * inferencia es una decision de dominio (`domain/gender.ts`, pura y testeada)
 * y la infraestructura no tiene por que rehacerla ni conocer el nombre.
 */
export interface VozRequerida {
  readonly leadId: string;
  readonly genero: GeneroInferido;
}

export interface SpeechSynthesisPort {
  /** Sintetiza el texto de UNA replica. `texto` ya es PII-free (viene de `CallSimulatorPort`). */
  synthesize(input: VozRequerida & { texto: string }): Promise<Result<CallTurnAudio>>;

  /**
   * Voz asignada a un lead. Deterministica: el mismo `leadId` SIEMPRE recibe la
   * misma voz.
   */
  voiceFor(input: VozRequerida): SimulatedVoice;
}
