import { describe, expect, it } from 'vitest';
import { TelemetryBodySchema } from './lead-enrichment.dto.js';

describe('TelemetryBodySchema', () => {
  it('rechaza vistas que pertenecen a un lead distinto al de la sesion', () => {
    const resultado = TelemetryBodySchema.safeParse({
      views: [
        {
          leadId: 'lead-ajeno',
          proyectoId: 'proyecto-1',
          seccion: 'card',
          dwellMs: 1200,
          ocurridoEn: '2026-07-25T08:00:01.000Z',
        },
      ],
      session: {
        leadId: 'lead-sesion',
        startedAt: '2026-07-25T08:00:00.000Z',
        endedAt: '2026-07-25T08:01:00.000Z',
        totalTarjetas: 1,
        decididas: 1,
        likes: 1,
        favoritos: 0,
        passes: 0,
        intentScore: 50,
        tiempoTotalMs: 60_000,
      },
    });

    expect(resultado.success).toBe(false);
  });
});
