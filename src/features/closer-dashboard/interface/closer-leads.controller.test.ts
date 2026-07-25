import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Application } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeadListPage } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import { InMemoryLeadRepository } from '../../../shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { InMemorySessionStore } from '../../../shared/infrastructure/persistence/in-memory/in-memory-session.store.js';
import { ok } from '../../../shared/kernel/result.js';
import { createCloserDashboardModule } from '../closer-dashboard.module.js';
import { EnvCloserAuthAdapter } from '../infrastructure/env-closer-auth.adapter.js';

interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly setCookie: string | null;
}

interface TestContext {
  readonly app: Application;
  readonly listViable: ReturnType<typeof vi.spyOn>;
}

const servers: ReturnType<Application['listen']>[] = [];

function createTestContext(page?: LeadListPage): TestContext {
  const nowMs = Date.parse('2026-07-25T15:00:00.000Z');
  const clock: ClockPort = {
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
  };
  const leads = new InMemoryLeadRepository();
  const listViable = vi
    .spyOn(leads, 'listViable')
    .mockResolvedValue(ok(page ?? { items: [], total: 0, pagina: 1, porPagina: 20 }));
  const sessionStore = new InMemorySessionStore({ clock, ttlMinutos: 60 });
  const auth = new EnvCloserAuthAdapter({
    username: 'closer.demo',
    password: 'correct-password',
    clock,
    ttlMinutes: 60,
  });
  const module = createCloserDashboardModule({
    auth,
    sessionStore,
    secureCookie: false,
    sessionTtlMinutes: 60,
    leads,
  });
  const app = express();
  app.use(express.json());
  app.use(module.publicRouter);
  app.use(module.requireCloser, module.protectedRouter);

  return { app, listViable };
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

async function login(app: Application): Promise<string> {
  const response = await request(app, '/api/closer/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      usuario: 'closer.demo',
      contrasena: 'correct-password',
    }),
  });
  const setCookie = response.setCookie;
  if (setCookie === null) throw new Error('El login no emitio cookie');
  return setCookie.split(';', 1)[0]!;
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

describe('GET /api/closer/leads', () => {
  it('devuelve la pagina esperada por el frontend con los defaults', async () => {
    const context = createTestContext();
    const cookie = await login(context.app);

    const response = await request(context.app, '/api/closer/leads', {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      data: expect.objectContaining({
        items: expect.any(Array),
        total: expect.any(Number),
        pagina: 1,
        porPagina: 20,
      }),
    });
    expect(context.listViable).toHaveBeenCalledWith(
      {
        soloAfiliados: null,
        soloNutridos: null,
        segmento: null,
        ciudad: null,
        scoreMinimo: null,
        banda: null,
        busqueda: null,
      },
      'score_desc',
      1,
      20,
    );
  });

  it('transforma filtros booleanos explicitos y paginacion', async () => {
    const context = createTestContext({
      items: [],
      total: 0,
      pagina: 2,
      porPagina: 10,
    });
    const cookie = await login(context.app);

    const response = await request(
      context.app,
      '/api/closer/leads?soloAfiliados=false&soloNutridos=true&sort=recencia_desc&pagina=2&porPagina=10',
      { headers: { cookie } },
    );

    expect(response.status).toBe(200);
    expect(context.listViable).toHaveBeenCalledWith(
      expect.objectContaining({
        soloAfiliados: false,
        soloNutridos: true,
      }),
      'recencia_desc',
      2,
      10,
    );
  });

  it.each(['soloAfiliados=1', 'porPagina=101', 'desconocido=valor'])(
    'rechaza query invalida: %s',
    async (query) => {
      const context = createTestContext();
      const cookie = await login(context.app);

      const response = await request(context.app, `/api/closer/leads?${query}`, {
        headers: { cookie },
      });

      expect(response.status).toBe(400);
      expect(context.listViable).not.toHaveBeenCalled();
    },
  );

  it('requiere una sesion de closer', async () => {
    const context = createTestContext();

    const response = await request(context.app, '/api/closer/leads');

    expect(response.status).toBe(401);
    expect(context.listViable).not.toHaveBeenCalled();
  });
});
