/**
 * Tests de `src/composition-root.ts`. Task 2.12. Spec: app-bootstrap-back
 * "Health check responds on a clean checkout", "No F2-F4 wiring present".
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppEnv } from '../src/shared/infrastructure/config/env.js';
import { createApp } from '../src/composition-root.js';

function fakeEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 0,
    logLevel: 'silent',
    corsOrigins: ['http://localhost:5173'],
    trustProxy: 0,
    llmProvider: 'stub',
    anthropicApiKey: null,
    llmModel: 'claude-sonnet-5',
    deepseekApiKey: null,
    deepseekModel: 'deepseek-chat',
    closerSessionSecret: 'secreto-de-pruebas-no-real-treinta-dos-chars',
    closerSessionTtlMinutes: 480,
    closerUsername: 'closer.demo',
    closerPassword: 'correct-password',
    leadSessionTtlMinutes: 43_200,
    emailProvider: 'mock',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: null,
    smtpPassword: null,
    smtpFrom: null,
    persistenceDriver: 'memory',
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    weightsPath: './data/weights.json',
    projectProfilesPath: './data/project_profiles.json',
    projectsCatalogPath: './data/projects_catalog.json',
    privacyPolicyVersion: 'v1-test',
    callSimProvider: 'stub',
    speechProvider: 'none',
    awsRegion: 'us-east-1',
    pollyEngine: 'generative',
    pollyVoiceFemale: 'Mia',
    pollyVoiceMale: 'Andres',
    transcriptionProvider: 'none',
    ...overrides,
  };
}

let close: (() => Promise<void>) | null = null;

async function startTestApp(env: AppEnv): Promise<string> {
  const { server: expressApp } = await createApp(env);
  const server = createServer(expressApp);
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

  it('monta F2.1 (lead-enrichment) tras la integracion: GET /api/leads/enrichment/deck ya no es 404', async () => {
    const baseUrl = await startTestApp(fakeEnv());

    // `deck` es la ruta real que registra el controller de F2.1 (start/turn
    // estan en API_ROUTES pero aun sin implementar). Sin leadId respondera
    // 400 de validacion, pero nunca 404: la ruta existe, el modulo esta montado.
    const respuesta = await fetch(`${baseUrl}/api/leads/enrichment/deck`);

    expect(respuesta.status).not.toBe(404);
  });

  it('una ruta inexistente responde 404 uniforme via notFoundHandler, nunca HTML por defecto', async () => {
    const baseUrl = await startTestApp(fakeEnv());

    const respuesta = await fetch(`${baseUrl}/ruta-que-no-existe`);
    const cuerpo = (await respuesta.json()) as { ok: boolean; error: { code: string } };

    expect(respuesta.status).toBe(404);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.error.code).toBe('NOT_FOUND');
  });

  it('el composition root entra a lead-intake solo por su modulo, nunca por su domain/ o application/ (feature isolation de F1)', () => {
    const fuente = readFileSync(new URL('../src/composition-root.ts', import.meta.url), 'utf8');
    // Aislamiento de F1: el composition root no alcanza los internals de
    // lead-intake, solo su `{ router }`. (F2.1 usa otra composicion, con sus
    // puertos cableados aqui — fuera del alcance de esta garantia.)
    expect(fuente).not.toMatch(/lead-intake\/domain\//u);
    expect(fuente).not.toMatch(/lead-intake\/application\//u);
    expect(fuente).toMatch(/lead-intake\.module\.js/u);
  });
});
