/**
 * Almacen de sesiones del lead en memoria. Capa: infrastructure (adapter de
 * `LeadSessionStorePort`). Mismo criterio que
 * `in-memory-session.store.ts` (closer): ES UN STUB DE DEMO, no una solucion
 * final — al reiniciar el proceso todas las sesiones mueren.
 *
 * OWASP A02: el token se genera con el CSPRNG (`randomBytes(32)`) y se guarda
 * HASHEADO con SHA-256. Un volcado de memoria o un log accidental del mapa no
 * entrega sesiones utilizables.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { LeadSession } from '@contracts';
import type { ClockPort } from '../../../application/ports/clock.port.js';
import type { LeadSessionStorePort } from '../../../application/ports/lead-auth.port.js';
import { UnauthorizedError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';

interface RegistroDeSesion {
  readonly session: LeadSession;
  readonly expiraEnMs: number;
}

export interface InMemoryLeadSessionStoreDeps {
  readonly clock: ClockPort;
  /**
   * Igual a `env.leadSessionTtlMinutes`. Deliberadamente MUCHO mas largo que la
   * sesion del closer: un lead no vuelve a diario a nutrirse, y pedirle un OTP
   * nuevo cada pocas horas espantaria el uso real del recorrido de F2.2.
   */
  readonly ttlMinutos: number;
}

const BYTES_DE_TOKEN = 32;

export class InMemoryLeadSessionStore implements LeadSessionStorePort {
  /** Clave = hash del token, nunca el token en claro. */
  private readonly sesiones = new Map<string, RegistroDeSesion>();

  constructor(private readonly deps: InMemoryLeadSessionStoreDeps) {}

  issue(leadId: string): Promise<Result<{ token: string }>> {
    const token = randomBytes(BYTES_DE_TOKEN).toString('hex');
    const expiraEnMs = this.deps.clock.nowMs() + this.deps.ttlMinutos * 60 * 1000;
    this.sesiones.set(this.hashDeToken(token), {
      session: { leadId, expiraEn: new Date(expiraEnMs).toISOString() },
      expiraEnMs,
    });
    return Promise.resolve(ok({ token }));
  }

  verify(token: string): Promise<Result<LeadSession>> {
    const clave = this.hashDeToken(token);
    const registro = this.sesiones.get(clave);

    // Mismo error para "no existe", "expiro" y "revocada": distinguirlos
    // permite sondear tokens ajenos (OWASP A07).
    if (registro === undefined) {
      return Promise.resolve(err(new UnauthorizedError()));
    }
    if (registro.expiraEnMs <= this.deps.clock.nowMs()) {
      this.sesiones.delete(clave);
      return Promise.resolve(err(new UnauthorizedError()));
    }

    return Promise.resolve(ok(structuredClone(registro.session)));
  }

  /** Idempotente: revocar una sesion inexistente no es un error para el cliente. */
  revoke(token: string): Promise<Result<void>> {
    this.sesiones.delete(this.hashDeToken(token));
    return Promise.resolve(ok(undefined));
  }

  private hashDeToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
