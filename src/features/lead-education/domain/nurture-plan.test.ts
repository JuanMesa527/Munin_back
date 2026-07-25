import { describe, expect, it } from 'vitest';
import type { LeadProfile, ProjectProfile } from '@contracts';
import { SMMLV_2026 } from '@contracts';
import { createEmptyLeadProfile } from '@shared/domain/index.js';
import { isErr, isOk } from '@shared/kernel/result.js';
import { computeNurturePlan } from './nurture-plan.js';

const PROYECTO: ProjectProfile = {
  proyectoId: 'proj-norte-1',
  nombre: 'Torres del Norte',
  ciudad: 'Bogotá',
  zona: 'norte',
  precioDesde: 120_000_000,
  precioHasta: 180_000_000,
  esVIS: true,
  perfilComprador: {},
  proporcionAfiliados: 0.9,
};

function perfil(overrides: Partial<LeadProfile>): LeadProfile {
  const base = createEmptyLeadProfile('lead-1', '2026-07-25T00:00:00.000Z');
  return { ...base, ...overrides };
}

describe('computeNurturePlan', () => {
  it('calcula gap y meses con subsidio de 2-4 SMMLV', () => {
    const resultado = computeNurturePlan(
      perfil({
        rangoSalarial: '2-4 SMMLV',
        ahorroDeclarado: 10_000_000,
        capacidadAhorroMensual: 1_000_000,
      }),
      PROYECTO,
    );

    expect(isOk(resultado)).toBe(true);
    if (!isOk(resultado)) return;
    const plan = resultado.value;

    const subsidioEsperado = 20 * SMMLV_2026; // 32_470_000
    const gapEsperado = 120_000_000 - 10_000_000 - subsidioEsperado; // 77_530_000
    expect(plan.subsidioEstimado).toBe(subsidioEsperado);
    expect(plan.gap).toBe(gapEsperado);
    expect(plan.mesesParaCalificar).toBe(Math.ceil(gapEsperado / 1_000_000)); // 78
    expect(plan.proyectoObjetivoId).toBe('proj-norte-1');
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
