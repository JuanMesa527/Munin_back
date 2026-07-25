import { describe, expect, it } from 'vitest';
import type { LeadProfile, ProjectProfile } from '@contracts';
import { SMMLV_2026 } from '@contracts';
import { createEmptyLeadProfile } from '@shared/domain/index.js';
import { isErr, isOk } from '@shared/kernel/result.js';
import { computeNurturePlan, PORCENTAJE_CUOTA_INICIAL } from './nurture-plan.js';

const PROYECTO: ProjectProfile = {
  proyectoId: 'proj-norte-1',
  nombre: 'Torres del Norte',
  ciudad: 'Bogotá',
  zona: 'norte',
  precioDesde: 120_000_000,
  precioHasta: 180_000_000,
  esVIS: true,
  perfilComprador: {},
  perfilCalibrado: false,
  proporcionAfiliados: 0.9,
};

function perfil(overrides: Partial<LeadProfile>): LeadProfile {
  const base = createEmptyLeadProfile('lead-1', '2026-07-25T00:00:00.000Z');
  return { ...base, ...overrides };
}

describe('computeNurturePlan', () => {
  it('la meta de ahorro es la cuota inicial (30% del precio), no el precio completo', () => {
    const resultado = computeNurturePlan(
      perfil({ rangoSalarial: '4-6 SMMLV', ahorroDeclarado: 0, capacidadAhorroMensual: 1_000_000 }),
      PROYECTO,
    );

    expect(isOk(resultado)).toBe(true);
    if (!isOk(resultado)) return;
    expect(resultado.value.cuotaInicialObjetivo).toBe(120_000_000 * PORCENTAJE_CUOTA_INICIAL);
    expect(resultado.value.cuotaInicialObjetivo).toBe(36_000_000);
    // Nunca se mide contra el precio completo del proyecto.
    expect(resultado.value.gap).toBeLessThan(120_000_000);
  });

  it('calcula el gap contra la cuota inicial cuando el subsidio no la cubre del todo', () => {
    // '4-6 SMMLV' no aplica al SFV (TOPE_SFV_SMMLV = 4): subsidio en 0, asi el
    // gap se puede verificar solo contra ahorro y cuota inicial, sin ruido.
    const resultado = computeNurturePlan(
      perfil({
        rangoSalarial: '4-6 SMMLV',
        ahorroDeclarado: 10_000_000,
        capacidadAhorroMensual: 1_000_000,
      }),
      PROYECTO,
    );

    expect(isOk(resultado)).toBe(true);
    if (!isOk(resultado)) return;
    const plan = resultado.value;

    const cuotaInicialEsperada = 120_000_000 * PORCENTAJE_CUOTA_INICIAL; // 36_000_000
    const gapEsperado = cuotaInicialEsperada - 10_000_000; // 26_000_000
    expect(plan.subsidioEstimado).toBe(0);
    expect(plan.aplicaSubsidio).toBe(false);
    expect(plan.cuotaInicialObjetivo).toBe(cuotaInicialEsperada);
    expect(plan.gap).toBe(gapEsperado);
    expect(plan.mesesParaCalificar).toBe(Math.ceil(gapEsperado / 1_000_000)); // 26
    expect(plan.proyectoObjetivoId).toBe('proj-norte-1');
  });

  it('el ahorro declarado mas el subsidio pueden cubrir toda la cuota inicial (gap = 0)', () => {
    // Con precio 120M al 30%, la cuota inicial objetivo es 36M. El subsidio de
    // 2-4 SMMLV (32_470_000) por si solo YA NO alcanza (antes, al 20%, si
    // alcanzaba) — ahora hace falta ademas el ahorro declarado para cubrirla.
    const resultado = computeNurturePlan(
      perfil({
        rangoSalarial: '2-4 SMMLV',
        ahorroDeclarado: 5_000_000,
        capacidadAhorroMensual: 1_000_000,
      }),
      PROYECTO,
    );

    expect(isOk(resultado)).toBe(true);
    if (!isOk(resultado)) return;
    const plan = resultado.value;

    const subsidioEsperado = 20 * SMMLV_2026; // 32_470_000
    expect(plan.subsidioEstimado).toBe(subsidioEsperado);
    expect(plan.cuotaInicialObjetivo).toBe(36_000_000);
    expect(plan.gap).toBe(0);
    expect(plan.mesesParaCalificar).toBe(0);
    expect(plan.aplicaSubsidio).toBe(true);
  });

  it('acota el gap a 0 y meses a 0 cuando el hogar ya cubre el objetivo', () => {
    const resultado = computeNurturePlan(
      perfil({
        rangoSalarial: '0-2 SMMLV',
        ahorroDeclarado: 200_000_000,
        capacidadAhorroMensual: 500_000,
      }),
      PROYECTO,
    );

    expect(isOk(resultado)).toBe(true);
    if (!isOk(resultado)) return;
    expect(resultado.value.gap).toBe(0);
    expect(resultado.value.mesesParaCalificar).toBe(0);
  });

  it('falla si falta la capacidad de ahorro mensual', () => {
    const resultado = computeNurturePlan(
      perfil({ rangoSalarial: '2-4 SMMLV', ahorroDeclarado: 10_000_000 }),
      PROYECTO,
    );
    expect(isErr(resultado)).toBe(true);
  });
});
