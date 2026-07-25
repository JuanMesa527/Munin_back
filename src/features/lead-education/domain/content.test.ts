import { describe, expect, it } from 'vitest';
import { ETAPAS_CAMINO } from '@contracts';
import { buildEducationalContent, scheduleFollowUp } from './content.js';

describe('buildEducationalContent', () => {
  it('devuelve contenido de la etapa pedida y coherente con ella', () => {
    const contenido = buildEducationalContent('financiar');
    expect(contenido.length).toBeGreaterThan(0);
    expect(contenido.every((c) => c.etapa === 'financiar')).toBe(true);
  });

  it('tiene al menos un contenido por cada una de las 5 etapas', () => {
    for (const etapa of ETAPAS_CAMINO) {
      expect(buildEducationalContent(etapa.id).length).toBeGreaterThan(0);
    }
  });
});

describe('scheduleFollowUp', () => {
  it('es un mock: nunca envía mensajería real', () => {
    const followUp = scheduleFollowUp('lead-1', '2026-08-01T00:00:00.000Z');
    expect(followUp.canal).toBe('mock');
    expect(followUp.leadId).toBe('lead-1');
  });
});
