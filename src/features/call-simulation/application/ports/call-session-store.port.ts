/**
 * Puerto de estado de la llamada en curso. Capa: application (puerto LOCAL de F5).
 *
 * El estado completo (turnos acumulados) vive SOLO server-side: el cliente
 * recibe un `CallTurn` por turno y el `CallScorecard` al colgar, nunca la
 * sesion completa (spec call-simulation-interface, requisito "Session State
 * Never Reaches the Client Directly").
 */

import type {
  CallDifficulty,
  CallTurn,
  IsoDateTime,
  PersonaContext,
  SimulatedVoice,
} from '@contracts';
import type { Result } from '../../../../shared/kernel/result.js';

/**
 * Un tramo de voz del closer ya dictado, a la espera de archivarse (A14).
 *
 * Se guarda en la sesion y no en el turno porque el dictado ocurre ANTES de
 * enviar el turno: cuando el audio llega todavia no existe el `CallTurn` al
 * que pertenece. `turnoPrevisto` es el indice que tendra ese turno cuando el
 * closer lo envie — si dicta dos veces para una sola frase, ambos tramos
 * comparten indice, que es exactamente lo que se quiere.
 */
export interface AudioClosePendiente {
  readonly turnoPrevisto: number;
  readonly base64: string;
  readonly sampleRate: number;
}

export interface CallSessionState {
  callId: string;
  leadId: string;
  dificultad: CallDifficulty;
  persona: PersonaContext;
  voz: SimulatedVoice;
  /** Todos los turnos, INCLUIDA la apertura en el indice 0. Orden de ocurrencia. */
  turnos: CallTurn[];
  /** Voz del closer capturada durante la llamada. Se sube al colgar. */
  audiosCloser: AudioClosePendiente[];
  iniciadaEn: IsoDateTime;
}

export interface CallSessionStorePort {
  create(session: CallSessionState): Promise<Result<void>>;
  /** `NotFoundError` si `callId` no existe o ya expiro (TTL). */
  get(callId: string): Promise<Result<CallSessionState>>;
  /** Agrega un turno y devuelve el estado actualizado. */
  appendTurn(callId: string, turno: CallTurn): Promise<Result<CallSessionState>>;
  /**
   * Guarda un tramo de voz del closer. Es best-effort por definicion: si la
   * sesion ya no existe, se descarta en silencio — nunca debe hacer fallar la
   * transcripcion, que es lo que el closer esta esperando en pantalla.
   */
  appendAudioCloser(callId: string, audio: AudioClosePendiente): Promise<void>;
  /** Cierra la sesion: la borra del store y devuelve el estado final para el veredicto. */
  end(callId: string): Promise<Result<CallSessionState>>;
}
