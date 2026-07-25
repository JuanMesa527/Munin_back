import { describe, expect, it } from 'vitest';
import type { LeadProfile } from '@contracts';
import { SMMLV_2026 } from '@contracts';
import { createEmptyLeadProfile } from './lead.js';
import { estimateSubsidy } from './subsidy.js';

function perfilCon(rangoSalarial: string | null): LeadProfile {
  const base = createEmptyLeadProfile('lead-1', '2026-07-25T00:00:00.000Z');
  return { ...base, rangoSalarial };
}

describe('estimateSubsidy', () => {
  it('otorga 30 SMMLV al hogar de hasta 2 SMMLV', () => {
    const estimacion = estimateSubsidy(perfilCon('0-2 SMMLV'));
    expect(estimacion.aplica).toBe(true);
    expect(estimacion.monto).toBe(30 * SMMLV_2026);
  });

  it('otorga 20 SMMLV al hogar de 2 a 4 SMMLV', () => {
    const estimacion = estimateSubsidy(perfilCon('2-4 SMMLV'));
    expect(estimacion.aplica).toBe(true);
    expect(estimacion.monto).toBe(20 * SMMLV_2026);
  });

  it('no aplica por encima de 4 SMMLV', () => {
    const estimacion = estimateSubsidy(perfilCon('4-6 SMMLV'));
    expect(estimacion.aplica).toBe(false);
    expect(estimacion.monto).toBe(0);
  });

  it('no aplica en el tramo abierto (>10 SMMLV)', () => {
    expect(estimateSubsidy(perfilCon('>10 SMMLV')).aplica).toBe(false);
  });

  it('sin rango declarado no puede estimar -> no aplica', () => {
    const estimacion = estimateSubsidy(perfilCon(null));
    expect(estimacion.aplica).toBe(false);
    expect(estimacion.monto).toBe(0);
  });

  it('quien ya es propietario no aspira, aunque su ingreso califique', () => {
    // Gate de PRIMERA vivienda, no un peso: `0-2 SMMLV` calificaria de sobra.
    const estimacion = estimateSubsidy({ ...perfilCon('0-2 SMMLV'), tieneVivienda: true });
    expect(estimacion.aplica).toBe(false);
    expect(estimacion.monto).toBe(0);
    expect(estimacion.motivo).toMatch(/primera vivienda/iu);
  });

  it('siempre explica el motivo, aplique o no', () => {
    // Sin motivo, un monto en la ficha es indistinguible de un invento.
    for (const perfil of [perfilCon('0-2 SMMLV'), perfilCon('>10 SMMLV'), perfilCon(null)]) {
      expect(estimateSubsidy(perfil).motivo.length).toBeGreaterThan(0);
    }
  });
});
