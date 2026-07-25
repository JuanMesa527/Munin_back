/**
 * Persistencia de la llamada terminada. Capa: application (puerto LOCAL de F5).
 *
 * Guarda DOS cosas de naturaleza distinta detras de una sola interfaz:
 *  - el registro (transcripcion + veredicto + highlights), que es una fila;
 *  - el audio, que son objetos binarios en un bucket.
 *
 * Van juntas porque para el caso de uso son un solo acto ("archiva esta
 * llamada") y separarlas obligaria a orquestar dos puertos y a dejar registros
 * huerfanos si uno falla.
 *
 * NUNCA bloquea el veredicto: `EndCallUseCase` archiva best-effort. Que no se
 * pueda guardar el historico no puede impedirle al closer ver como le fue.
 */

import type { CallRecord, CallRecordingRef } from '@contracts';
import type { Result } from '../../../../shared/kernel/result.js';

/** Un audio a subir, ya en memoria. */
export interface AudioParaGuardar {
  readonly turno: number;
  readonly quien: 'closer' | 'lead';
  readonly contenidoBase64: string;
  readonly contentType: 'audio/pcm' | 'audio/mpeg';
  /** Obligatorio en el PCM del closer: sin el, el audio no se puede reproducir. */
  readonly sampleRate: number | null;
}

export interface CallRecordingStorePort {
  /** Archiva el registro completo. El audio ya subido viaja en `grabaciones`. */
  guardar(registro: CallRecord): Promise<Result<void>>;

  /**
   * Sube los audios de la llamada y devuelve sus punteros. Devuelve solo los
   * que se subieron: un audio perdido no invalida el resto de la grabacion.
   */
  subirAudios(callId: string, audios: readonly AudioParaGuardar[]): Promise<CallRecordingRef[]>;
}
