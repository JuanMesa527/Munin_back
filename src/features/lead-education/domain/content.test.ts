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

  it('tiene exactamente 15 lecciones en "financiar" (marco 2026 + requisitos + SFV + 4 modalidades + crédito/leasing/alternativas/tasas/cuota + proceso + calendario + plan)', () => {
    const contenido = buildEducationalContent('financiar');
    expect(contenido.length).toBe(15);
  });

  it('incluye las lecciones nuevas de subsidio 2026 con sus ids exactos', () => {
    const ids = buildEducationalContent('financiar').map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'cont-financiar-marco-2026',
        'cont-financiar-requisitos-generales',
        'cont-financiar-que-es-sfv',
        'cont-financiar-modalidad-vivienda-nueva',
        'cont-financiar-modalidad-usada',
        'cont-financiar-modalidad-arrendamiento',
        'cont-financiar-modalidad-construccion-mejoramiento',
        'cont-financiar-proceso-postulacion',
        'cont-financiar-calendario-vigencia',
      ]),
    );
  });

  it('el marco 2026 y los requisitos generales van antes que el detalle de modalidades', () => {
    const ids = buildEducationalContent('financiar').map((c) => c.id);
    const idxMarco = ids.indexOf('cont-financiar-marco-2026');
    const idxRequisitos = ids.indexOf('cont-financiar-requisitos-generales');
    const idxModalidadNueva = ids.indexOf('cont-financiar-modalidad-vivienda-nueva');
    expect(idxMarco).toBeGreaterThanOrEqual(0);
    expect(idxRequisitos).toBeGreaterThan(idxMarco);
    expect(idxModalidadNueva).toBeGreaterThan(idxRequisitos);
  });
});

describe('scheduleFollowUp', () => {
  it('es un mock: nunca envía mensajería real', () => {
    const followUp = scheduleFollowUp('lead-1', '2026-08-01T00:00:00.000Z');
    expect(followUp.canal).toBe('mock');
    expect(followUp.leadId).toBe('lead-1');
  });
});
