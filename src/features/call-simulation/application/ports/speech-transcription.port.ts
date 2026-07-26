/**
 * Puerto de transcripcion de voz del closer. Capa: application (puerto LOCAL de
 * F5).
 *
 * Existe por la: la Web Speech API del navegador no es un motor local sino un
 * mando a distancia al servicio del fabricante, y solo Chrome presta el suyo de
 * forma fiable. Para que el dictado sirva en cualquier navegador, el
 * reconocimiento tiene que ser nuestro.
 *
 * ESPEJO DE `SpeechSynthesisPort`: aquel convierte texto del lead en voz, este
 * convierte voz del closer en texto. Se mantienen separados porque fallan por
 * motivos distintos y porque una demo puede querer Polly sin Transcribe.
 *
 * NUNCA es una precondicion para que la llamada avance: si falla, el closer
 * escribe. El input de texto es el camino garantizado ("Microphone Failure
 * Never Blocks the Call").
 */

import type { TranscriptionResult, UtteranceAudio } from '@contracts';
import type { Result } from '../../../../shared/kernel/result.js';

export interface SpeechTranscriptionPort {
  /**
   * Transcribe UN tramo de voz ya cerrado (push-to-talk), no un stream.
   *
   * El audio es PCM crudo del comercial practicando: no es PII del titular y
   * no se persiste en ningun lado — se transcribe y se descarta.
   */
  transcribe(audio: UtteranceAudio): Promise<Result<TranscriptionResult>>;
}
