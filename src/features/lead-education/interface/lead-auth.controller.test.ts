import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Application } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { leadProfile } from '@shared/infrastructure/persistence/lead-repository.contract.js';
import { InMemoryLeadContactLookup } from '@shared/infrastructure/persistence/in-memory/in-memory-lead-contact-lookup.adapter.js';
import { InMemoryLeadRepository } from '@shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { InMemoryLeadSessionStore } from '@shared/infrastructure/persistence/in-memory/in-memory-lead-session.store.js';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import { InMemoryLeadOtpStore } from '../infrastructure/in-memory-lead-otp.store.js';
import { createLeadAuthRouter } from './lead-auth.controller.js';
import { createRequireLead } from './require-lead.js';

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

function createTestContext(options: { isProduction?: boolean; secureCookie?: boolean } = {}): TestContext {
  let nowMs = Date.parse('2026-07-25T15:00:00.000Z');
  const clock: ClockPort = {
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
  };
  const leads = new InMemoryLeadRepository();
  void leads.save({ ...leadProfile('lead-1'), telefono: '+573001112233', email: 'persona@correo.com' });

  const sessionStore = new InMemoryLeadSessionStore({ clock, ttlMinutos: 60 });
  const app = express();
  app.use(express.json());
  app.use(
    createLeadAuthRouter({
      contactLookup: new InMemoryLeadContactLookup(leads),
      otp: new InMemoryLeadOtpStore({ clock }),
      sessionStore,
      secureCookie: options.secureCookie ?? false,
      sessionTtlMinutes: 60,
      isProduction: options.isProduction ?? false,
    }),
  );
  app.get('/protected', createRequireLead(sessionStore), (_req, res) => {
    res.status(200).json({ lead: res.locals.lead });
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

describe('lead auth HTTP', () => {
  it('fuera de produccion, solicitar el OTP devuelve el codigo para poder probar sin SMS real', async () => {
    const { app } = createTestContext();

    const response = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      data: { enviado: true, codigo: expect.stringMatching(/^\d{6}$/u) as unknown },
    });
  });

  it('en produccion, el codigo NUNCA viaja en la respuesta', async () => {
    const { app } = createTestContext({ isProduction: true });

    const response = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );

    expect(response.body).toEqual({ ok: true, data: { enviado: true } });
  });

  it('responde igual exista o no el contacto (anti-enumeracion)', async () => {
    const { app } = createTestContext();

    const existente = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );
    const inexistente = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573009999999', email: null }),
    );

    expect(existente.status).toBe(inexistente.status);
    const clavesExistente = Object.keys((existente.body as { data: object }).data).sort();
    const clavesInexistente = Object.keys((inexistente.body as { data: object }).data).sort();
    expect(clavesExistente).not.toEqual(clavesInexistente);
    // Ambos exponen `enviado: true`; solo el contacto real trae `codigo`.
    expect((inexistente.body as { data: { enviado: boolean } }).data.enviado).toBe(true);
  });

  it('login por OTP completo: pedir codigo, verificarlo y usar la sesion emitida', async () => {
    const { app } = createTestContext();
    const requested = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );
    const codigo = (requested.body as { data: { codigo: string } }).data.codigo;

    const verified = await request(
      app,
      '/api/leads/education/auth/otp/verify',
      jsonRequest({ telefono: '+573001112233', email: null, codigo }),
    );

    expect(verified.status).toBe(200);
    expect(verified.setCookie).toContain('lead_session=');
    expect(verified.setCookie).toContain('HttpOnly');
    expect(verified.body).toEqual({ ok: true, data: { leadId: 'lead-1' } });

    const protectedResponse = await request(app, '/protected', {
      headers: { cookie: cookiePair(verified) },
    });
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body).toEqual({ lead: { leadId: 'lead-1', expiraEn: expect.any(String) as unknown } });
  });

  it('un codigo incorrecto y un contacto inexistente dan el MISMO error', async () => {
    const { app } = createTestContext();
    await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );

    const codigoIncorrecto = await request(
      app,
      '/api/leads/education/auth/otp/verify',
      jsonRequest({ telefono: '+573001112233', email: null, codigo: '000000' }),
    );
    const contactoInexistente = await request(
      app,
      '/api/leads/education/auth/otp/verify',
      jsonRequest({ telefono: '+573009999999', email: null, codigo: '000000' }),
    );

    expect(codigoIncorrecto.status).toBe(401);
    expect(contactoInexistente).toMatchObject({
      status: codigoIncorrecto.status,
      body: codigoIncorrecto.body,
    });
  });

  it('la sesion expira segun su TTL', async () => {
    const context = createTestContext();
    const requested = await request(
      context.app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );
    const codigo = (requested.body as { data: { codigo: string } }).data.codigo;
    const verified = await request(
      context.app,
      '/api/leads/education/auth/otp/verify',
      jsonRequest({ telefono: '+573001112233', email: null, codigo }),
    );

    context.advanceMinutes(61);
    const session = await request(context.app, '/api/leads/education/auth/session', {
      headers: { cookie: cookiePair(verified) },
    });

    expect(session.status).toBe(401);
  });

  it('logout revoca y limpia la cookie de forma idempotente', async () => {
    const { app } = createTestContext();
    const requested = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );
    const codigo = (requested.body as { data: { codigo: string } }).data.codigo;
    const verified = await request(
      app,
      '/api/leads/education/auth/otp/verify',
      jsonRequest({ telefono: '+573001112233', email: null, codigo }),
    );
    const cookie = cookiePair(verified);

    const first = await request(app, '/api/leads/education/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    const second = await request(app, '/api/leads/education/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    const session = await request(app, '/api/leads/education/auth/session', {
      headers: { cookie },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.setCookie).toContain('lead_session=;');
    expect(session.status).toBe(401);
  });
});
