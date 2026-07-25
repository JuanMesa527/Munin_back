/**
 * Test dedicado de `publicRateLimiter` sobre `createIntakeRouter`. Task 2.9.
 * Threat matrix "Public-endpoint abuse": 61a solicitud en la ventana -> 429.
 *
 * Vive en su PROPIO archivo (no junto a `intake.controller.test.ts`) porque
 * `publicRateLimiter` (security.ts) es un singleton a nivel de modulo: vitest
 * aisla el registro de modulos POR ARCHIVO, asi que este es el unico lugar
 * donde el contador arranca en cero.
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationTurn } from '@contracts';
import { createIntakeRouter } from '../../../../src/features/lead-intake/interface/intake.controller.js';
import { errorHandler } from '../../../../src/shared/infrastructure/http/error-handler.js';
import { ok } from '../../../../src/shared/kernel/result.js';

const AHORA = '2026-07-25T00:00:00.000Z';

function turnoVacio(): ConversationTurn {
  return {
    profile: {
      id: 'lead-1',
      consentimiento: null,
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

describe('createIntakeRouter — publicRateLimiter', () => {
  it('la solicitud numero 61 dentro de la ventana responde 429', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createIntakeRouter({
        startConversation: { execute: vi.fn(() => Promise.resolve(ok(turnoVacio()))) },
        submitConsent: { execute: vi.fn(() => Promise.resolve(ok(turnoVacio()))) },
        processConversationTurn: { execute: vi.fn(() => Promise.resolve(ok(turnoVacio()))) },
      }),
    );
    app.use(errorHandler);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(port)}`;

    try {
      let ultimaRespuesta: Response | null = null;
      for (let intento = 0; intento < 61; intento += 1) {
        ultimaRespuesta = await fetch(`${baseUrl}/api/leads/intake/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      }

      expect(ultimaRespuesta?.status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
    }
  }, 20_000);
});
