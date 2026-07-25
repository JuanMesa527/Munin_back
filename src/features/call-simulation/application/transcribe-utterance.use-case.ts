/**
 * Caso de uso: pasar a texto un tramo de voz del closer. Capa: application.
 *
 * Deliberadamente delgado: no hay regla de negocio que aplicar sobre un audio,
 * asi que el caso de uso existe para dar el punto de composicion (puerto +
 * limite) y no para decidir nada. Toda la traduccion vive en el adapter.
 *
 * NO TOCA LA SESION DE LA LLAMADA. Transcribir y hablar son dos pasos
 * separados a proposito: el closer dicta, revisa lo que salio, lo corrige si
 * el motor entendio mal y RECIEN ENTONCES envia el turno. Acoplarlos
 * mandaria al lead simulado cualquier error de transcripcion sin que el
 * comercial pueda intervenir.
 */

import type { TranscriptionResult, UtteranceAudio } from '@contracts';
import type { Result } from '../../../shared/kernel/result.js';
import type { CallSessionStorePort } from './ports/call-session-store.port.js';
import type { SpeechTranscriptionPort } from './ports/speech-transcription.port.js';

export interface TranscribeUtteranceDeps {
  readonly transcription: SpeechTranscriptionPort;
  readonly sessions: CallSessionStorePort;
}

export interface TranscribeUtteranceInput extends UtteranceAudio {
  /** Presente = la llamada se esta archivando y hay que guardar este tramo. */
  readonly callId?: string | undefined;
}

export class TranscribeUtteranceUseCase {
  constructor(private readonly deps: TranscribeUtteranceDeps) {}

  async execute(input: TranscribeUtteranceInput): Promise<Result<TranscriptionResult>> {
    const transcrito = await this.deps.transcription.transcribe({
      base64: input.base64,
      sampleRate: input.sampleRate,
    });

    // El archivo va DESPUES de transcribir y no bloquea el resultado: si algo
    // falla guardando, el closer igual recibe su texto.
    if (input.callId !== undefined) {
      await this.guardarAudio(input.callId, input);
    }

    return transcrito;
  }

  /**
   * El indice previsto es `turnos.length`: el turno que el closer creara
   * cuando envie lo que acaba de dictar. Si dicta dos tramos para una sola
   * frase, ambos quedan con el mismo indice, que es lo correcto.
   */
  private async guardarAudio(callId: string, audio: UtteranceAudio): Promise<void> {
    const sesion = await this.deps.sessions.get(callId);
    if (!sesion.ok) return;

    await this.deps.sessions.appendAudioCloser(callId, {
      turnoPrevisto: sesion.value.turnos.length,
      base64: audio.base64,
      sampleRate: audio.sampleRate,
    });
  }
}
