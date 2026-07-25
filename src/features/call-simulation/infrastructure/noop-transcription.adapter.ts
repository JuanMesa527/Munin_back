/**
 * Transcripcion apagada. Capa: infrastructure (adapter de `SpeechTranscriptionPort`).
 *
 * Driver por defecto (`TRANSCRIPTION_PROVIDER=none`): el boton de micro le dice
 * al closer que el dictado no esta configurado y la llamada sigue por texto.
 * NO es un estado de error — es el modo sin credenciales de AWS, igual que
 * `SPEECH_PROVIDER=none` para Polly.
 */

import type { TranscriptionResult, UtteranceAudio } from '@contracts';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err } from '../../../shared/kernel/result.js';
import type { SpeechTranscriptionPort } from '../application/ports/speech-transcription.port.js';

export class NoopTranscriptionAdapter implements SpeechTranscriptionPort {
  transcribe(_audio: UtteranceAudio): Promise<Result<TranscriptionResult>> {
    return Promise.resolve(
      err(
        new DataUnavailableError(
          'El dictado por voz no esta configurado en este entorno. Escribe tu respuesta.',
        ),
      ),
    );
  }
}
