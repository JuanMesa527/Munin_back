/**
 * Estado de llamada en memoria. Capa: infrastructure (adapter de `CallSessionStorePort`).
 *
 * Driver por defecto de la demo, igual que el resto de la persistencia del
 * repo: sin base de datos. Con TTL: una llamada de entrenamiento abandonada
 * no debe vivir para siempre en el proceso. El reloj es inyectado
 * (`ClockPort`) y no `Date.now()` directo — `system-clock.adapter.ts` es el
 * UNICO lugar del backend que llama `Date`.
 */

import type { CallTurn } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import { NotFoundError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type {
  AudioClosePendiente,
  CallSessionState,
  CallSessionStorePort,
} from '../application/ports/call-session-store.port.js';

/** Una sesion de entrenamiento no dura mas que esto; pasado el TTL se descarta. */
const TTL_MS = 30 * 60 * 1000;

const MENSAJE_NO_ENCONTRADA = 'La llamada no existe o ya expiro';

interface Entrada {
  estado: CallSessionState;
  expiraEnMs: number;
}

function clonar(estado: CallSessionState): CallSessionState {
  return {
    ...estado,
    turnos: estado.turnos.map((turno: CallTurn) => ({ ...turno })),
    audiosCloser: [...estado.audiosCloser],
  };
}

export class InMemoryCallSessionStore implements CallSessionStorePort {
  private readonly porCallId = new Map<string, Entrada>();

  constructor(private readonly clock: ClockPort) {}

  create(session: CallSessionState): Promise<Result<void>> {
    this.porCallId.set(session.callId, {
      estado: clonar(session),
      expiraEnMs: this.clock.nowMs() + TTL_MS,
    });
    return Promise.resolve(ok(undefined));
  }

  get(callId: string): Promise<Result<CallSessionState>> {
    const entrada = this.leerVigente(callId);
    if (entrada === null) {
      return Promise.resolve(err(new NotFoundError(MENSAJE_NO_ENCONTRADA)));
    }
    return Promise.resolve(ok(clonar(entrada.estado)));
  }

  appendTurn(callId: string, turno: CallTurn): Promise<Result<CallSessionState>> {
    const entrada = this.leerVigente(callId);
    if (entrada === null) {
      return Promise.resolve(err(new NotFoundError(MENSAJE_NO_ENCONTRADA)));
    }
    entrada.estado.turnos.push({ ...turno });
    // Cada turno renueva el TTL: una llamada activa no debe expirar a mitad de camino.
    entrada.expiraEnMs = this.clock.nowMs() + TTL_MS;
    return Promise.resolve(ok(clonar(entrada.estado)));
  }

  /**
   * Silencioso por diseno: el dictado no puede fallar porque la sesion
   * expiro. El closer esta esperando su texto, no le importa el archivo.
   */
  appendAudioCloser(callId: string, audio: AudioClosePendiente): Promise<void> {
    const entrada = this.leerVigente(callId);
    if (entrada !== null) {
      entrada.estado.audiosCloser.push(audio);
      entrada.expiraEnMs = this.clock.nowMs() + TTL_MS;
    }
    return Promise.resolve();
  }

  end(callId: string): Promise<Result<CallSessionState>> {
    const entrada = this.leerVigente(callId);
    this.porCallId.delete(callId);
    if (entrada === null) {
      return Promise.resolve(err(new NotFoundError(MENSAJE_NO_ENCONTRADA)));
    }
    return Promise.resolve(ok(clonar(entrada.estado)));
  }

  private leerVigente(callId: string): Entrada | null {
    const entrada = this.porCallId.get(callId);
    if (entrada === undefined) return null;
    if (entrada.expiraEnMs < this.clock.nowMs()) {
      this.porCallId.delete(callId);
      return null;
    }
    return entrada;
  }
}
