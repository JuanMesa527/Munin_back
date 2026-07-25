import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Application, RequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BriefingSheet, CloserSession } from '@contracts';
import type { BuildBriefingUseCase } from '../application/build-briefing.use-case.js';
import type { RegistrarGestionUseCase } from '../application/registrar-gestion.use-case.js';
import type { RevealContactUseCase } from '../application/reveal-contact.use-case.js';
import { ok } from '../../../shared/kernel/result.js';
import { createCloserBriefingRouter } from './closer-briefing.controller.js';

interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

const servers: ReturnType<Application['listen']>[] = [];

function createApp(
  buildExecute = vi.fn().mockResolvedValue(
    ok({
      lead: { id: 'lead-1' },
      journey: null,
      talkingPoints: [],
      alertas: [],
      generadoEn: '2026-07-25T15:00:00.000Z',
      resumenScore: 'Score 82',
      objeciones: [],
    } as unknown as BriefingSheet),
  ),
  revealExecute = vi.fn().mockResolvedValue(ok({ telefono: '+573001234567' })),
  gestionExecute = vi.fn().mockResolvedValue(ok({ id: 'lead-1', gestion: { estado: 'agendado' } })),
): Application {
  const closer: CloserSession = {
    closerId: 'closer-session',
    nombre: 'Closer Demo',
    rol: 'closer',
    expiraEn: '2026-07-25T16:00:00.000Z',
  };
  const attachCloser: RequestHandler = (_req, res, next) => {
    res.locals.closer = closer;
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(attachCloser);
  app.use(
    createCloserBriefingRouter({
      buildBriefing: { execute: buildExecute } as unknown as BuildBriefingUseCase,
      revealContact: { execute: revealExecute } as unknown as RevealContactUseCase,
      registrarGestion: { execute: gestionExecute } as unknown as RegistrarGestionUseCase,
    }),
  );
  return app;
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
  };
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

describe('closer briefing controller', () => {
  it('expone el briefing por leadId validado', async () => {
    const execute = vi.fn().mockResolvedValue(
      ok({
        lead: { id: 'lead-1' },
        journey: null,
        talkingPoints: [],
        alertas: [],
        generadoEn: '2026-07-25T15:00:00.000Z',
        resumenScore: 'Score 82',
        objeciones: [],
      } as unknown as BriefingSheet),
    );
    const app = createApp(execute);

    const response = await request(app, '/api/closer/leads/briefing/lead-1');

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith('lead-1');
    expect(response.body).toEqual({
      ok: true,
      data: expect.objectContaining({ resumenScore: 'Score 82' }),
    });
  });

  it('toma closerId solo de res.locals para revelar el contacto', async () => {
    const execute = vi.fn().mockResolvedValue(ok({ telefono: '+573001234567' }));
    const app = createApp(undefined, execute);

    const response = await request(app, '/api/closer/leads/reveal-contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: 'lead-1', closerId: 'closer-del-body' }),
    });

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      leadId: 'lead-1',
      closerId: 'closer-session',
    });
  });

  it.each([{}, { leadId: '' }])('rechaza un body de reveal invalido: %j', async (body) => {
    const execute = vi.fn();
    const app = createApp(undefined, execute);

    const response = await request(app, '/api/closer/leads/reveal-contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
