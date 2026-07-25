import { createHash, timingSafeEqual } from 'node:crypto';
import type { CloserSession } from '@contracts';
import type { CloserAuthPort } from '../../../shared/application/ports/closer-auth.port.js';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import { UnauthorizedError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';

export interface EnvCloserAuthAdapterDeps {
  readonly username: string;
  readonly password: string;
  readonly clock: ClockPort;
  readonly ttlMinutes: number;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function securelyEquals(actual: string, expected: string): boolean {
  return timingSafeEqual(digest(actual), digest(expected));
}

export class EnvCloserAuthAdapter implements CloserAuthPort {
  constructor(private readonly deps: EnvCloserAuthAdapterDeps) {}

  verifyCredentials(input: {
    usuario: string;
    contrasena: string;
  }): Promise<Result<CloserSession>> {
    const usernameMatches = securelyEquals(input.usuario, this.deps.username);
    const passwordMatches = securelyEquals(input.contrasena, this.deps.password);

    if (!(usernameMatches && passwordMatches)) {
      return Promise.resolve(err(new UnauthorizedError('Credenciales no validas')));
    }

    const expiraEnMs = this.deps.clock.nowMs() + this.deps.ttlMinutes * 60 * 1000;
    return Promise.resolve(
      ok({
        closerId: this.deps.username,
        nombre: this.deps.username,
        rol: 'closer',
        expiraEn: new Date(expiraEnMs).toISOString(),
      }),
    );
  }
}
