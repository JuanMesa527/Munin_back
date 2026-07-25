/**
 * Tests de `interface/intake.controller.ts`. Task 2.9. Spec:
 * lead-intake-interface "Zod Validation at Every Endpoint", "No PII in
 * Logs". Threat matrix: "information leakage in errors".
 *
 * El caso "61a solicitud -> 429" vive en un archivo aparte
 * (`intake.controller.rate-limit.test.ts`) porque `publicRateLimiter`
 * (security.ts) es un singleton a nivel de modulo: correrlo aqui junto a
 * otras solicitudes haria el conteo dependiente del orden de los tests.
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Express } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationTurn } from '@contracts';
import { createIntakeRouter } from '../../../../src/features/lead-intake/interface/intake.controller.js';
import type { IntakeControllerDeps } from '../../../../src/features/lead-intake/interface/intake.controller.js';
import { errorHandler } from '../../../../src/shared/infrastructure/http/error-handler.js';
import { ok } from '../../../../src/shared/kernel/result.js';

const AHORA = '2026-07-25T00:00:00.000Z';

function turnoVacio(): ConversationTurn {
  return {
    profile: {
      id: 'lead-1',
      consentimiento: null,
      identidad: null,
      nombre: null,
      email: null,
      telefono: null,
      edad: null,
      estadoCivil: null,
      esAfiliado: null,
      rangoSalarial: null,
      segmento: null,
      personasACargo: null,
      ciudad: null,
      segmentoFamiliar: null,
      ahorroDeclarado: null,
      capacidadAhorroMensual: null,
      tieneVivienda: null,
      vinculacionLaboral: null,
      horizonteCompra: null,
      slotsLlenos: [],
      capacidad: null,
      score: null,
      proyectos: [],
      carril: null,
      createdAt: AHORA,
      updatedAt: AHORA,
    },
    mensajes: [],
    siguientePaso: null,
    progreso: 0,
    routing: null,
  };
}

function fakeDeps(overrides: Partial<IntakeControllerDeps> = {}): IntakeControllerDeps {
  return {
    startConversation: { execute: vi.fn(() => Promise.resolve(ok(turnoVacio()))) },
    submitConsent: { execute: vi.fn(() => Promise.resolve(ok(turnoVacio()))) },
    processConversationTurn: { execute: vi.fn(() => Promise.resolve(ok(turnoVacio()))) },
    ...overrides,
  };
}

let app: Express;
let baseUrl: string;
let close: () => Promise<void>;

async function startTestApp(deps: IntakeControllerDeps): Promise<void> {
  app = express();
  app.use(express.json());
  app.use(createIntakeRouter(deps));
  app.use(errorHandler);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(port)}`;
  close = () =>
    new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
}

describe('createIntakeRouter', () => {
  afterEach(async () => {
    await close();
  });

  it('rechaza un body de /turn malformado antes de invocar el caso de uso', async () => {
    const deps = fakeDeps();
    await startTestApp(deps);

    const respuesta = await fetch(`${baseUrl}/api/leads/intake/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: 'hola', quickReplyValue: null }),
    });
    const cuerpo = (await respuesta.json()) as { ok: boolean; error: { code: string } };

    expect(respuesta.status).toBe(400);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.error.code).toBe('VALIDATION_ERROR');
    expect(deps.processConversationTurn.execute).not.toHaveBeenCalled();
  });

  it('un fallo inesperado del caso de uso nunca filtra stack ni ruta interna en el body', async () => {
    const deps = fakeDeps({
      processConversationTurn: {
        execute: vi.fn(() =>
          Promise.reject(new Error('fallo inesperado del adapter en /Users/algo/secreto.ts')),
        ),
      },
    });
    await startTestApp(deps);

    const respuesta = await fetch(`${baseUrl}/api/leads/intake/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: 'lead-1', texto: 'hola', quickReplyValue: null }),
    });
    const textoCrudo = await respuesta.text();

    expect(respuesta.status).toBe(500);
    expect(textoCrudo).not.toContain('secreto.ts');
    expect(textoCrudo).not.toContain('at ');
    expect(textoCrudo).not.toContain('stack');
  });

  it('un /consent exitoso responde 200 con la envoltura ApiResponse', async () => {
    const deps = fakeDeps();
    await startTestApp(deps);

    const respuesta = await fetch(`${baseUrl}/api/leads/intake/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otorgado: true,
        versionPolitica: 'v1',
        finalidades: ['perfilamiento_vivienda'],
        canal: 'web-chat',
      }),
    });
    const cuerpo = (await respuesta.json()) as { ok: boolean };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.ok).toBe(true);
    expect(deps.submitConsent.execute).toHaveBeenCalledTimes(1);
  });

  it('/start no requiere body y responde 200', async () => {
    const deps = fakeDeps();
    await startTestApp(deps);

    const respuesta = await fetch(`${baseUrl}/api/leads/intake/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(respuesta.status).toBe(200);
    expect(deps.startConversation.execute).toHaveBeenCalledTimes(1);
  });
});
