import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import { loadEnv } from '../../../shared/infrastructure/config/env.js';
import { UnauthorizedError } from '../../../shared/kernel/errors.js';
import { EnvCloserAuthAdapter } from './env-closer-auth.adapter.js';

const AHORA_MS = Date.parse('2026-07-25T15:00:00.000Z');

const fixedClock: ClockPort = {
  now: () => new Date(AHORA_MS).toISOString(),
  nowMs: () => AHORA_MS,
};

function createAdapter(): EnvCloserAuthAdapter {
  return new EnvCloserAuthAdapter({
    username: 'closer.demo',
    password: 'correct-password',
    clock: fixedClock,
    ttlMinutes: 60,
  });
}

function stubBaseEnv(): void {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CLOSER_SESSION_SECRET', 'local-session-secret');
  vi.stubEnv('CLOSER_USERNAME', 'closer.demo');
  vi.stubEnv('CLOSER_PASSWORD', 'correct-password');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('EnvCloserAuthAdapter', () => {
  it('autentica las credenciales configuradas y crea la identidad de sesion', async () => {
    const result = await createAdapter().verifyCredentials({
      usuario: 'closer.demo',
      contrasena: 'correct-password',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        closerId: 'closer.demo',
        nombre: 'closer.demo',
        rol: 'closer',
        expiraEn: '2026-07-25T16:00:00.000Z',
      },
    });
  });

  it('devuelve un error indistinguible para usuario o contrasena incorrectos', async () => {
    const adapter = createAdapter();

    const wrongUser = await adapter.verifyCredentials({
      usuario: 'otro.usuario',
      contrasena: 'correct-password',
    });
    const wrongPassword = await adapter.verifyCredentials({
      usuario: 'closer.demo',
      contrasena: 'incorrect-password',
    });

    expect(wrongUser.ok).toBe(false);
    expect(wrongPassword.ok).toBe(false);
    if (!wrongUser.ok && !wrongPassword.ok) {
      expect(wrongUser.error).toBeInstanceOf(UnauthorizedError);
      expect(wrongPassword.error).toBeInstanceOf(UnauthorizedError);
      expect({
        code: wrongUser.error.code,
        message: wrongUser.error.message,
        fields: wrongUser.error.fields,
      }).toEqual({
        code: wrongPassword.error.code,
        message: wrongPassword.error.message,
        fields: wrongPassword.error.fields,
      });
    }
  });
});

describe('configuracion de credenciales del closer', () => {
  it('rechaza una contrasena vacia en cualquier entorno', () => {
    stubBaseEnv();
    vi.stubEnv('CLOSER_PASSWORD', '');

    expect(() => loadEnv()).toThrow(/CLOSER_PASSWORD/u);
  });

  it('exige al menos 12 caracteres para la contrasena en produccion', () => {
    stubBaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLOSER_SESSION_SECRET', 'a'.repeat(32));
    vi.stubEnv('CLOSER_PASSWORD', 'muy-corta');
    vi.stubEnv('PRIVACY_POLICY_VERSION', '2026-07-25.v1');

    expect(() => loadEnv()).toThrow(/CLOSER_PASSWORD debe tener al menos 12 caracteres/u);
  });
});
