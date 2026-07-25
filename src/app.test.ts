import type { AddressInfo } from 'node:net';
import type { Application } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { API_ROUTES } from '@contracts';
import { createApp } from './app.js';
import type { AppEnv } from './shared/infrastructure/config/env.js';

interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly setCookie: string | null;
}

const servers: ReturnType<Application['listen']>[] = [];

const TEST_ENV: AppEnv = {
  nodeEnv: 'test',
  isProduction: false,
  port: 3000,
  logLevel: 'silent',
  corsOrigins: ['http://localhost:5173'],
  llmProvider: 'stub',
  anthropicApiKey: null,
  llmModel: 'claude-sonnet-5',
  deepseekApiKey: null,
  deepseekModel: 'deepseek-v4-flash',
  closerSessionSecret: 'test-session-secret',
  closerSessionTtlMinutes: 60,
  closerUsername: 'closer.demo',
  closerPassword: 'correct-password',
  persistenceDriver: 'memory',
  supabaseUrl: null,
  supabaseServiceRoleKey: null,
  weightsPath: './data/weights.json',
  projectProfilesPath: './data/project_profiles.json',
  projectsCatalogPath: './data/projects_catalog.json',
  privacyPolicyVersion: 'demo-v1',
};

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

function postJson(body: unknown, cookie?: string): RequestInit {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== undefined) headers.cookie = cookie;
  return { method: 'POST', headers, body: JSON.stringify(body) };
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

describe('createApp', () => {
  it('integra summary, lista, briefing y reveal de un contacto ficticio', async () => {
    const { server } = await createApp(TEST_ENV);
    const leadId = 'demo-familia-soacha';

    const login = await request(
      server,
      API_ROUTES.closer.login,
      postJson({ usuario: 'closer.demo', contrasena: 'correct-password' }),
    );
    expect(login.status).toBe(200);
    const setCookie = login.setCookie;
    if (setCookie === null) throw new Error('El login no emitio cookie');
    const cookie = setCookie.split(';', 1)[0]!;

    const summary = await request(server, API_ROUTES.enrichment.summary, postJson({ leadId }));
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({
      ok: true,
      data: expect.objectContaining({
        lead: expect.objectContaining({
          identidad: expect.objectContaining({ nombre: 'DemoFamilia' }),
        }),
      }),
    });

    const list = await request(server, API_ROUTES.closer.leads, {
      headers: { cookie },
    });
    expect(list.status).toBe(200);
    expect(list.body).toEqual({
      ok: true,
      data: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ leadId, nombre: 'DemoFamilia' })]),
      }),
    });

    const briefing = await request(server, `${API_ROUTES.closer.briefing}/${leadId}`, {
      headers: { cookie },
    });
    expect(briefing.status).toBe(200);
    expect(briefing.body).toEqual({
      ok: true,
      data: expect.objectContaining({
        lead: expect.objectContaining({
          id: leadId,
          identidad: expect.objectContaining({ nombre: 'DemoFamilia' }),
        }),
      }),
    });

    const reveal = await request(
      server,
      API_ROUTES.closer.revealContact,
      postJson({ leadId }, cookie),
    );
    expect(reveal.status).toBe(200);
    expect(reveal.body).toEqual({
      ok: true,
      data: { telefono: '+57 300 000 0042' },
    });
  });
});
