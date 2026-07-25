/**
 * Tests de `src/app.ts`. Task 2.12. Spec: app-bootstrap-back
 * "Health check responds on a clean checkout", "No F2-F4 wiring present".
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppEnv } from '../src/shared/infrastructure/config/env.js';
import { createApp } from '../src/app.js';

function fakeEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 0,
    logLevel: 'silent',
    corsOrigins: ['http://localhost:5173'],
    llmProvider: 'stub',
    anthropicApiKey: null,
    llmModel: 'claude-sonnet-5',
    deepseekApiKey: null,
    deepseekModel: 'deepseek-chat',
    closerSessionSecret: 'secreto-de-pruebas-no-real-treinta-dos-chars',
    closerSessionTtlMinutes: 480,
    persistenceDriver: 'memory',
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    weightsPath: './data/weights.json',
    projectProfilesPath: './data/project_profiles.json',
    privacyPolicyVersion: 'v1-test',
    ...overrides,
  };
}

let close: (() => Promise<void>) | null = null;

async function startTestApp(env: AppEnv): Promise<string> {
  const app = createApp(env);
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const { port } = server.address() as AddressInfo;
  close = () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  return `http://127.0.0.1:${String(port)}`;
}

describe('createApp', () => {
  afterEach(async () => {
    if (close !== null) {
      await close();
      close = null;
    }
  });

  it('GET /api/health responde ok sin necesitar llave de LLM (LLM_PROVIDER=stub)', async () => {
    const baseUrl = await startTestApp(fakeEnv());

    const respuesta = await fetch(`${baseUrl}/api/health`);
    const cuerpo = (await respuesta.json()) as { ok: boolean };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.ok).toBe(true);
  });

  it('monta el router de lead-intake: POST /api/leads/intake/start responde', async () => {
    const baseUrl = await startTestApp(fakeEnv());

    const respuesta = await fetch(`${baseUrl}/api/leads/intake/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(respuesta.status).toBe(200);
  });

  it('no monta ninguna ruta de F2-F4 (enrichment/education/closer)', async () => {
    const baseUrl = await startTestApp(fakeEnv());

    const respuesta = await fetch(`${baseUrl}/api/leads/enrichment/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(respuesta.status).toBe(404);
  });

  it('una ruta inexistente responde 404 uniforme via notFoundHandler, nunca HTML por defecto', async () => {
    const baseUrl = await startTestApp(fakeEnv());

    const respuesta = await fetch(`${baseUrl}/ruta-que-no-existe`);
    const cuerpo = (await respuesta.json()) as { ok: boolean; error: { code: string } };

    expect(respuesta.status).toBe(404);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.error.code).toBe('NOT_FOUND');
  });

  it('app.ts solo importa el modulo de la feature, nunca domain/ o application/ directamente (feature isolation)', () => {
    const fuente = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
    expect(fuente).not.toMatch(/from ['"][^'"]*\/domain\//u);
    expect(fuente).not.toMatch(/from ['"][^'"]*\/application\//u);
    expect(fuente).toMatch(/lead-intake\.module\.js/u);
  });
});
