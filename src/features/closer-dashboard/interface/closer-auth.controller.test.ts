import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Application } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import { InMemorySessionStore } from '../../../shared/infrastructure/persistence/in-memory/in-memory-session.store.js';
import { EnvCloserAuthAdapter } from '../infrastructure/env-closer-auth.adapter.js';
import { createCloserAuthRouter } from './closer-auth.controller.js';
import { createRequireCloser } from './require-closer.js';

const MINUTO_MS = 60_000;

interface TestContext {
  readonly app: Application;
  readonly advanceMinutes: (minutes: number) => void;
}

interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly setCookie: string | null;
}

const servers: ReturnType<Application['listen']>[] = [];

function createTestContext(secureCookie = false): TestContext {
  let nowMs = Date.parse('2026-07-25T15:00:00.000Z');
  const clock: ClockPort = {
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
  };
  const sessionStore = new InMemorySessionStore({ clock, ttlMinutos: 60 });
  const auth = new EnvCloserAuthAdapter({
    username: 'closer.demo',
    password: 'correct-password',
    clock,
    ttlMinutes: 60,
  });
  const app = express();
  app.use(express.json());
  app.use(
    createCloserAuthRouter({
      auth,
      sessionStore,
      secureCookie,
      sessionTtlMinutes: 60,
    }),
  );
  app.get('/protected', createRequireCloser(sessionStore), (_req, res) => {
    res.status(200).json({ closer: res.locals.closer });
  });

  return {
    app,
    advanceMinutes: (minutes: number) => {
      nowMs += minutes * MINUTO_MS;
    },
  };
}

async function request(
  app: Application,
  path: string,
  init: RequestInit = {},
): Promise<HttpResponse> {
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${String(address.port)}${path}`, init);
  const text = await response.text();

  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as unknown) : null,
    setCookie: response.headers.get('set-cookie'),
  };
}

function jsonRequest(body: unknown, cookie?: string): RequestInit {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== undefined) headers.cookie = cookie;
  return { method: 'POST', headers, body: JSON.stringify(body) };
}

async function login(app: Application): Promise<HttpResponse> {
  return request(
    app,
    '/api/closer/auth/login',
    jsonRequest({ usuario: 'closer.demo', contrasena: 'correct-password' }),
  );
}

function cookiePair(response: HttpResponse): string {
  const header = response.setCookie;
  if (header === null) throw new Error('La respuesta no emitio cookie');
  return header.split(';', 1)[0]!;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error !== undefined) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

describe('closer auth HTTP', () => {
  it('login emite cookie segura para JavaScript y no expone el token en el body', async () => {
    const { app } = createTestContext();

    const response = await login(app);

    expect(response.status).toBe(200);
    expect(response.setCookie).toContain('closer_session=');
    expect(response.setCookie).toContain('HttpOnly');
    expect(response.setCookie).toContain('SameSite=Strict');
    expect(response.setCookie).not.toContain('Secure');
    expect(response.body).toEqual({
      ok: true,
      data: expect.objectContaining({
        closerId: 'closer.demo',
        rol: 'closer',
      }),
    });
    expect(JSON.stringify(response.body)).not.toContain(cookiePair(response).split('=')[1]);
  });

  it('marca la cookie como Secure solo en produccion', async () => {
    const { app } = createTestContext(true);

    const response = await login(app);

    expect(response.setCookie).toContain('Secure');
  });

  it('responde igual para usuario o contrasena incorrectos', async () => {
    const { app } = createTestContext();

    const wrongUser = await request(
      app,
      '/api/closer/auth/login',
      jsonRequest({ usuario: 'otro.usuario', contrasena: 'correct-password' }),
    );
    const wrongPassword = await request(
      app,
      '/api/closer/auth/login',
      jsonRequest({ usuario: 'closer.demo', contrasena: 'incorrect-password' }),
    );

    expect(wrongUser.status).toBe(401);
    expect(wrongPassword).toMatchObject({ status: wrongUser.status, body: wrongUser.body });
  });

  it('session devuelve exclusivamente la sesion verificada por el store', async () => {
    const { app } = createTestContext();
    const loggedIn = await login(app);

    const response = await request(app, '/api/closer/auth/session', {
      headers: {
        cookie: cookiePair(loggedIn),
        'x-closer-id': 'closer-inyectado',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      data: expect.objectContaining({ closerId: 'closer.demo' }),
    });
  });

  it('rechaza la sesion cuando el token expira', async () => {
    const context = createTestContext();
    const loggedIn = await login(context.app);
    context.advanceMinutes(61);

    const response = await request(context.app, '/api/closer/auth/session', {
      headers: { cookie: cookiePair(loggedIn) },
    });

    expect(response.status).toBe(401);
  });

  it('logout revoca y limpia la cookie de forma idempotente', async () => {
    const { app } = createTestContext();
    const loggedIn = await login(app);
    const cookie = cookiePair(loggedIn);

    const first = await request(app, '/api/closer/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    const second = await request(app, '/api/closer/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    const session = await request(app, '/api/closer/auth/session', {
      headers: { cookie },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.setCookie).toContain('closer_session=;');
    expect(session.status).toBe(401);
  });

  it('requireCloser rechaza requests sin sesion', async () => {
    const { app } = createTestContext();

    const response = await request(app, '/protected');

    expect(response.status).toBe(401);
  });

  it('requireCloser publica en locals solo el closer de la sesion verificada', async () => {
    const { app } = createTestContext();
    const loggedIn = await login(app);

    const response = await request(app, '/protected', {
      headers: {
        cookie: cookiePair(loggedIn),
        'x-closer-id': 'closer-inyectado',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      closer: expect.objectContaining({ closerId: 'closer.demo' }),
    });
  });
});
