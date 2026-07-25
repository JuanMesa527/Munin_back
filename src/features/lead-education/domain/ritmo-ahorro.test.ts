import { describe, expect, it } from 'vitest';
import type { Meta } from '@contracts';
import { computeRitmoAhorro } from './ritmo-ahorro.js';

const AHORA = '2026-07-25T00:00:00.000Z';

function metaAhorro(overrides: Partial<Meta> = {}): Meta {
  return {
    id: 'meta-ahorro',
    titulo: 'Cerrá tu brecha de ahorro',
    descripcion: 'Registrá tus aportes hasta alcanzar la meta de ahorro.',
    tipo: 'ahorro',
    objetivo: 100_000_000,
    alcanzado: 0,
    completada: false,
    puntos: 100,
    badgeId: 'badge-ahorrador',
    ...overrides,
  };
}

describe('computeRitmoAhorro', () => {
  it('sin aportes: ritmo 0, sin proyeccion, y sin fecha -> enRitmoParaFecha null', () => {
    const ritmo = computeRitmoAhorro(metaAhorro(), AHORA);
    expect(ritmo).toEqual({
      ritmoMensualPromedio: 0,
      mesesRestantesAlRitmoActual: null,
      enRitmoParaFecha: null,
    });
  });

  it('sin aportes pero con fechaObjetivo: enRitmoParaFecha es false (no true ni null)', () => {
    const meta = metaAhorro({ fechaObjetivo: '2027-01-01T00:00:00.000Z' });
    const ritmo = computeRitmoAhorro(meta, AHORA);
    expect(ritmo.ritmoMensualPromedio).toBe(0);
    expect(ritmo.mesesRestantesAlRitmoActual).toBeNull();
    expect(ritmo.enRitmoParaFecha).toBe(false);
  });

  it('un solo aporte en el mes actual: el ritmo es el monto del aporte', () => {
    const meta = metaAhorro({
      alcanzado: 10_000_000,
      aportes: [{ id: 'a1', monto: 10_000_000, ocurridoEn: AHORA }],
    });
    const ritmo = computeRitmoAhorro(meta, AHORA);
    expect(ritmo.ritmoMensualPromedio).toBe(10_000_000);
    // faltante = 90_000_000 / 10_000_000 = 9 meses
    expect(ritmo.mesesRestantesAlRitmoActual).toBe(9);
  });

  it('varios aportes en el MISMO mes calendario: se suman en un solo mes', () => {
    const meta = metaAhorro({
      alcanzado: 15_000_000,
      aportes: [
        { id: 'a1', monto: 10_000_000, ocurridoEn: '2026-07-01T00:00:00.000Z' },
        { id: 'a2', monto: 5_000_000, ocurridoEn: '2026-07-20T00:00:00.000Z' },
      ],
    });
    const ritmo = computeRitmoAhorro(meta, AHORA); // mismo mes que ambos aportes
    expect(ritmo.ritmoMensualPromedio).toBe(15_000_000);
  });

  it('aportes en varios meses SIN saltos: promedia sobre esos meses', () => {
    const meta = metaAhorro({
      alcanzado: 30_000_000,
      aportes: [
        { id: 'a1', monto: 10_000_000, ocurridoEn: '2026-05-01T00:00:00.000Z' },
        { id: 'a2', monto: 10_000_000, ocurridoEn: '2026-06-01T00:00:00.000Z' },
        { id: 'a3', monto: 10_000_000, ocurridoEn: '2026-07-01T00:00:00.000Z' },
      ],
    });
    const ritmo = computeRitmoAhorro(meta, AHORA); // mayo, junio, julio = 3 meses
    expect(ritmo.ritmoMensualPromedio).toBe(10_000_000);
  });

  it('aportes con un mes salteado: el mes vacio cuenta como 0 en el promedio', () => {
    const meta = metaAhorro({
      alcanzado: 20_000_000,
      aportes: [
        { id: 'a1', monto: 10_000_000, ocurridoEn: '2026-05-01T00:00:00.000Z' },
        // junio salteado
        { id: 'a2', monto: 10_000_000, ocurridoEn: '2026-07-01T00:00:00.000Z' },
      ],
    });
    const ritmo = computeRitmoAhorro(meta, AHORA); // mayo, junio(0), julio = 3 meses
    expect(ritmo.ritmoMensualPromedio).toBeCloseTo(20_000_000 / 3);
  });

  it('con fechaObjetivo holgada: enRitmoParaFecha es true', () => {
    const meta = metaAhorro({
      objetivo: 100_000_000,
      alcanzado: 10_000_000,
      aportes: [{ id: 'a1', monto: 10_000_000, ocurridoEn: AHORA }],
      fechaObjetivo: '2028-01-01T00:00:00.000Z', // muy lejos, sobra tiempo
    });
    const ritmo = computeRitmoAhorro(meta, AHORA);
    expect(ritmo.enRitmoParaFecha).toBe(true);
  });

  it('con fechaObjetivo ajustada: enRitmoParaFecha es false cuando el ritmo no alcanza', () => {
    const meta = metaAhorro({
      objetivo: 100_000_000,
      alcanzado: 10_000_000,
      aportes: [{ id: 'a1', monto: 10_000_000, ocurridoEn: AHORA }],
      // faltan 90M a 10M/mes = 9 meses, pero la fecha objetivo es el mes que viene
      fechaObjetivo: '2026-08-01T00:00:00.000Z',
    });
    const ritmo = computeRitmoAhorro(meta, AHORA);
    expect(ritmo.enRitmoParaFecha).toBe(false);
  });
});
