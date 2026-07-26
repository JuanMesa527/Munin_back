import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Application } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { leadProfile } from '@shared/infrastructure/persistence/lead-repository.contract.js';
import { InMemoryLeadContactLookup } from '@shared/infrastructure/persistence/in-memory/in-memory-lead-contact-lookup.adapter.js';
import { InMemoryLeadRepository } from '@shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { InMemoryLeadSessionStore } from '@shared/infrastructure/persistence/in-memory/in-memory-lead-session.store.js';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import type { LeadOtpDeliveryPort } from '@shared/application/ports/lead-otp-delivery.port.js';
import { ok } from '@shared/kernel/result.js';
import { InMemoryLeadOtpStore } from '../infrastructure/in-memory-lead-otp.store.js';
import { createLeadAuthRouter } from './lead-auth.controller.js';
import { createRequireLead } from './require-lead.js';

const MINUTO_MS = 60_000;

interface TestContext {
  readonly app: Application;
  readonly advanceMinutes: (minutes: number) => void;
  /** A donde termino saliendo cada codigo: es lo unico que prueba el gate por `leadId`. */
  readonly enviados: { email: string | null; telefono: string | null }[];
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
  const enviados: { email: string | null; telefono: string | null }[] = [];
  const otpDelivery: LeadOtpDeliveryPort = {
    send: (input) => {
      enviados.push({ email: input.email, telefono: input.telefono });
      return Promise.resolve(ok(undefined));
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    createLeadAuthRouter({
      contactLookup: new InMemoryLeadContactLookup(leads),
      otp: new InMemoryLeadOtpStore({ clock }),
      otpDelivery,
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
    enviados,
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

  it('en produccion responde igual exista o no el contacto (anti-enumeracion)', async () => {
    // La propiedad se verifica CON `isProduction: true`, que es donde tiene que
    // valer: fuera de produccion el endpoint revela la causa a proposito (test
    // de abajo), porque un "enviado: true" mudo volvia indistinguibles un SMTP
    // caido, un correo sin cuenta y un envio correcto.
    const { app } = createTestContext({ isProduction: true });

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
    expect(existente.body).toEqual(inexistente.body);
    expect((inexistente.body as { data: { enviado: boolean } }).data.enviado).toBe(true);
  });

  it('fuera de produccion dice que no existe la cuenta en vez de fingir el envio', async () => {
    const { app } = createTestContext();

    const inexistente = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573009999999', email: null }),
    );

    expect(inexistente.status).toBe(404);
    expect((inexistente.body as { ok: boolean }).ok).toBe(false);
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

/**
 * Gate de entrada al modulo educativo: el lead acaba de terminar F1, la app
 * tiene su `leadId` y el correo se lo dio al chat. No se le vuelve a pedir el
 * contacto — se le manda el codigo al que ya declaro y sin ese codigo no entra.
 */
describe('gate por leadId', () => {
  it('pide el codigo con solo el leadId y lo manda al correo que F1 capturo', async () => {
    const { app, enviados } = createTestContext();

    const response = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ leadId: 'lead-1' }),
    );

    expect(response.status).toBe(200);
    expect(enviados).toEqual([{ email: 'persona@correo.com', telefono: '+573001112233' }]);
  });

  it('devuelve el destino ENMASCARADO: el lead sabe que bandeja abrir sin que el correo se filtre entero', async () => {
    const { app } = createTestContext();

    const response = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ leadId: 'lead-1' }),
    );

    expect(response.body).toMatchObject({
      data: { destino: 'pe*****@correo.com', canal: 'email' },
    });
  });

  it('por telefono/email NO devuelve destino: delataria si ese contacto existe', async () => {
    const { app } = createTestContext();

    const response = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ telefono: '+573001112233', email: null }),
    );

    expect((response.body as { data: Record<string, unknown> }).data).not.toHaveProperty('destino');
  });

  it('el codigo del gate abre la sesion igual que el del login', async () => {
    const { app } = createTestContext();
    const requested = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ leadId: 'lead-1' }),
    );
    const codigo = (requested.body as { data: { codigo: string } }).data.codigo;

    const verified = await request(
      app,
      '/api/leads/education/auth/otp/verify',
      jsonRequest({ leadId: 'lead-1', codigo }),
    );

    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ ok: true, data: { leadId: 'lead-1' } });
    const protegido = await request(app, '/protected', {
      headers: { cookie: cookiePair(verified) },
    });
    expect(protegido.status).toBe(200);
  });

  it('tener el leadId NO alcanza: sin el codigo correcto no hay sesion', async () => {
    const { app } = createTestContext();
    await request(app, '/api/leads/education/auth/otp/request', jsonRequest({ leadId: 'lead-1' }));

    const verified = await request(
      app,
      '/api/leads/education/auth/otp/verify',
      jsonRequest({ leadId: 'lead-1', codigo: '000000' }),
    );

    expect(verified.status).toBe(401);
    expect(verified.setCookie).toBeNull();
  });

  it('un leadId inexistente si responde el error real (un id no es enumerable como un correo)', async () => {
    const { app, enviados } = createTestContext();

    const response = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ leadId: 'lead-que-no-existe' }),
    );

    expect(response.status).toBe(404);
    expect(enviados).toEqual([]);
  });

  it('mandar dos canales a la vez es 400: el lead se resuelve por uno solo', async () => {
    const { app } = createTestContext();

    const response = await request(
      app,
      '/api/leads/education/auth/otp/request',
      jsonRequest({ leadId: 'lead-1', email: 'persona@correo.com' }),
    );

    expect(response.status).toBe(400);
  });
});
