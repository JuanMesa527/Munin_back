/**
 * Almacen de sesiones del closer en memoria. Capa: infrastructure
 * (adapter de `SessionStorePort`).
 *
 * ES UN STUB DE DEMO, no una solucion: al reiniciar el proceso todas las
 * sesiones mueren y no sirve con mas de una instancia. En produccion esto es
 * Redis con TTL nativo, o directamente la SSO corporativa de Colsubsidio (que
 * seria lo correcto: no queremos ser nosotros los duenos de las credenciales).
 *
 * OWASP A02 (fallas criptograficas): el token se genera con el CSPRNG
 * (`randomBytes(32)`) y se guarda HASHEADO con SHA-256. Un volcado de memoria o
 * un log accidental del mapa no entrega sesiones utilizables, porque de la clave
 * guardada no se puede volver al token.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { CloserSession } from '@contracts';
import type { ClockPort } from '../../../application/ports/clock.port.js';
import type { SessionStorePort } from '../../../application/ports/closer-auth.port.js';
import { UnauthorizedError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';

interface RegistroDeSesion {
  readonly session: CloserSession;
  readonly expiraEnMs: number;
}

export interface InMemorySessionStoreDeps {
  readonly clock: ClockPort;
  /** Igual a `env.closerSessionTtlMinutes`. La sesion no vive para siempre. */
  readonly ttlMinutos: number;
}

const BYTES_DE_TOKEN = 32;

export class InMemorySessionStore implements SessionStorePort {
  /** Clave = hash del token, nunca el token en claro. */
  private readonly sesiones = new Map<string, RegistroDeSesion>();

  constructor(private readonly deps: InMemorySessionStoreDeps) {}

  issue(session: CloserSession): Promise<Result<{ token: string }>> {
    const token = randomBytes(BYTES_DE_TOKEN).toString('hex');
    this.sesiones.set(this.hashDeToken(token), {
      session: structuredClone(session),
      expiraEnMs: this.deps.clock.nowMs() + this.deps.ttlMinutos * 60 * 1000,
    });
    // El token vuelve UNA sola vez, para que el controller lo ponga en la cookie
    // httpOnly. De aqui en adelante nadie mas lo puede leer.
    return Promise.resolve(ok({ token }));
  }

  verify(token: string): Promise<Result<CloserSession>> {
    const clave = this.hashDeToken(token);
    const registro = this.sesiones.get(clave);

    // Mismo error para "no existe", "expiro" y "revocada": distinguirlos permite
    // sondear tokens ajenos (OWASP A07).
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
