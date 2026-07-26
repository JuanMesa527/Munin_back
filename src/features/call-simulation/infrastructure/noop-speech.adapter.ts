/**
 * Sintesis de voz apagada. Capa: infrastructure (adapter de
 * `SpeechSynthesisPort`).
 *
 * Driver por defecto (`SPEECH_PROVIDER=none`): `CallTurn.audio` queda `null` en
 * toda la sesion y la UI cae a solo texto. NO es un estado de error — es una
 * configuracion soportada de proposito, para demos sin credenciales de AWS.
 */

import type { CallTurnAudio, SimulatedVoice } from '@contracts';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err } from '../../../shared/kernel/result.js';
import type { SpeechSynthesisPort, VozRequerida } from '../application/ports/speech-synthesis.port.js';

export class NoopSpeechAdapter implements SpeechSynthesisPort {
  // El use case trata este `err` como "sin audio", nunca como fallo del turno.
  synthesize(_input: VozRequerida & { texto: string }): Promise<Result<CallTurnAudio>> {
    return Promise.resolve(
      err(new DataUnavailableError('Sintesis de voz deshabilitada (SPEECH_PROVIDER=none)')),
    );
  }

  voiceFor(_input: VozRequerida): SimulatedVoice {
    return { voiceId: 'none', engine: 'standard', languageCode: 'es-MX' };
  }
}
