/**
 * Tests de `features/lead-intake/domain/profiling.ts`. Spec: lead-intake-profiling
 * (las 4 requirements: funciones puras, factores explicables, sin estrato,
 * afiliacion como factor no como gate).
 */

import { describe, expect, it } from 'vitest';
import type { LeadProfile, ScoringWeights } from '@contracts';
import { createEmptyLeadProfile } from '../../../../src/shared/domain/lead.js';
import {
  checkAffiliation,
  estimateCapacity,
  getTopFactors,
  scoreLead,
} from '../../../../src/features/lead-intake/domain/profiling.js';

const AHORA = '2026-07-25T00:00:00.000Z';

function perfilBase(overrides: Partial<LeadProfile> = {}): LeadProfile {
  return { ...createEmptyLeadProfile('lead-1', AHORA), ...overrides };
}

function pesosBase(overrides: Partial<ScoringWeights['pesos']> = {}): ScoringWeights {
  return {
    version: 'weights-v1',
    pesos: {
      afiliacion: 0.4,
      ahorro: 0.3,
      capacidadAhorroMensual: 0.3,
      ...overrides,
    },
    umbralViable: 60,
    calibracion: { metrica: 'AUC', valor: 0.8, n: 4142 },
    generadoEn: AHORA,
  };
}

describe('checkAffiliation', () => {
  it('reporta esAfiliado true sin aplicar cupo 90/10', () => {
    const perfil = perfilBase({ esAfiliado: true });
    expect(checkAffiliation(perfil)).toEqual({ esAfiliado: true, aplicaCupo9010: false });
  });

  it('reporta esAfiliado false con cupo 90/10 aplicable', () => {
    const perfil = perfilBase({ esAfiliado: false });
    expect(checkAffiliation(perfil)).toEqual({ esAfiliado: false, aplicaCupo9010: true });
  });
});

describe('estimateCapacity', () => {
  it('retorna err cuando no hay ningun dato relevante', () => {
    const perfil = perfilBase();
    const resultado = estimateCapacity(perfil);
    expect(resultado.ok).toBe(false);
  });

  it('usa el COP crudo sin escalar (trampa de datos #1)', () => {
    const perfil = perfilBase({ ahorroDeclarado: 5_000_000, rangoSalarial: '2-4 SMMLV' });
    const resultado = estimateCapacity(perfil);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.precioMaximoEstimado).not.toBeNull();
      expect(resultado.value.precioMaximoEstimado).toBeGreaterThanOrEqual(5_000_000);
      // Nunca de-escalado por 1000 (no debe verse como 5000 ni 5000000000).
      expect(Number.isSafeInteger(resultado.value.precioMaximoEstimado)).toBe(true);
    }
  });

  it('una banda mas alta de ingresos produce una cuota mensual estimada mayor', () => {
    const bajo = estimateCapacity(perfilBase({ rangoSalarial: '0-2 SMMLV' }));
    const alto = estimateCapacity(perfilBase({ rangoSalarial: '6-10 SMMLV' }));
    expect(bajo.ok).toBe(true);
    expect(alto.ok).toBe(true);
    if (bajo.ok && alto.ok) {
      expect(alto.value.cuotaMensualEstimada ?? 0).toBeGreaterThan(bajo.value.cuotaMensualEstimada ?? 0);
    }
  });

  it('reporta los slots relevantes aun faltantes en `faltantes`', () => {
    const perfil = perfilBase({ ahorroDeclarado: 1_000_000, slotsLlenos: ['ahorro'] });
    const resultado = estimateCapacity(perfil);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.faltantes).toContain('rangoSalarial');
      expect(resultado.value.faltantes).toContain('capacidadAhorroMensual');
      expect(resultado.value.faltantes).not.toContain('ahorro');
    }
  });
});

describe('scoreLead', () => {
  it('no tiene dependencia de LlmPort en su firma (inspeccion por longitud de parametros)', () => {
    expect(scoreLead.length).toBe(3);
  });

  it('retorna un ScoreResult con factores no vacios cuando hay datos', () => {
    const perfil = perfilBase({ esAfiliado: true, ahorroDeclarado: 5_000_000 });
    const resultado = scoreLead(perfil, pesosBase(), AHORA);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.factores.length).toBeGreaterThan(0);
      expect(resultado.value.weightsVersion).toBe('weights-v1');
      expect(resultado.value.calculadoEn).toBe(AHORA);
      expect(resultado.value.valor).toBeGreaterThanOrEqual(0);
      expect(resultado.value.valor).toBeLessThanOrEqual(100);
    }
  });

  it('nunca incluye un factor de estrato aunque los pesos lo trajeran', () => {
    const perfil = perfilBase({ esAfiliado: true, ahorroDeclarado: 5_000_000 });
    const pesosConEstrato = pesosBase({ estrato: 0.5 });
    const resultado = scoreLead(perfil, pesosConEstrato, AHORA);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.factores.some((factor) => /estrato/iu.test(factor.nombre))).toBe(false);
    }
  });

  it('un no-afiliado con todos los demas datos igual recibe un ScoreResult completo, no un rechazo temprano', () => {
    const perfil = perfilBase({ esAfiliado: false, ahorroDeclarado: 5_000_000, capacidadAhorroMensual: 500_000 });
    const resultado = scoreLead(perfil, pesosBase(), AHORA);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.factores.some((factor) => factor.nombre === 'afiliacion')).toBe(true);
      expect(resultado.value.factores.length).toBeGreaterThan(1);
    }
  });

  it('retorna DataUnavailableError cuando no hay ningun factor computable', () => {
    const perfil = perfilBase();
    const pesosSinDatosDelLead = pesosBase();
    const resultado = scoreLead(perfil, pesosSinDatosDelLead, AHORA);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('DATA_UNAVAILABLE');
    }
  });
});

describe('getTopFactors', () => {
  it('ordena los factores por contribucion absoluta descendente', () => {
    const score = {
      valor: 70,
      factores: [
        { nombre: 'a', peso: 0.1, valor: 'x', contribucion: 5 },
        { nombre: 'b', peso: 0.5, valor: 'y', contribucion: 40 },
        { nombre: 'c', peso: 0.2, valor: 'z', contribucion: -20 },
      ],
      weightsVersion: 'weights-v1',
      calculadoEn: AHORA,
    };
    const top = getTopFactors(score, 2);
    expect(top).toHaveLength(2);
    expect(top[0]?.nombre).toBe('b');
    expect(top[1]?.nombre).toBe('c');
  });
});
