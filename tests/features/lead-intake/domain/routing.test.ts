/**
 * Tests de `features/lead-intake/domain/routing.ts`. Spec: lead-intake-routing
 * "Pure, LLM-Free Routing Decision". design.md D4: `null` iff score/capacidad null.
 */

import { describe, expect, it } from 'vitest';
import type { CapacityBand, ScoreResult } from '@contracts';
import type { AffiliationCheck } from '../../../../src/features/lead-intake/domain/profiling.js';
import { decideViability } from '../../../../src/features/lead-intake/domain/routing.js';

const AHORA = '2026-07-25T00:00:00.000Z';

const CAPACIDAD: CapacityBand = {
  banda: 'alta',
  faltantes: [],
  cuotaMensualEstimada: 3_000_000,
  precioMaximoEstimado: 250_000_000,
};

function score(valor: number): ScoreResult {
  return {
    valor,
    factores: [
      { nombre: 'afiliacion', peso: 0.4, valor: 'Afiliado', contribucion: 0.4, intensidad: 100 },
    ],
    weightsVersion: 'weights-v1',
    calculadoEn: AHORA,
  };
}

const AFILIADO: AffiliationCheck = { esAfiliado: true, aplicaCupo9010: false };
const NO_AFILIADO: AffiliationCheck = { esAfiliado: false, aplicaCupo9010: true };

describe('decideViability', () => {
  it('no tiene dependencia de LlmPort en su firma (un unico objeto de entrada)', () => {
    expect(decideViability.length).toBe(1);
  });

  it('retorna null cuando score es null', () => {
    const resultado = decideViability({
      score: null,
      capacidad: CAPACIDAD,
      afiliacion: AFILIADO,
      umbralViable: 60,
      now: AHORA,
    });
    expect(resultado).toBeNull();
  });

  it('retorna null cuando capacidad es null', () => {
    const resultado = decideViability({
      score: score(80),
      capacidad: null,
      afiliacion: AFILIADO,
      umbralViable: 60,
      now: AHORA,
    });
    expect(resultado).toBeNull();
  });

  it('retorna null cuando ambos son null', () => {
    const resultado = decideViability({
      score: null,
      capacidad: null,
      afiliacion: AFILIADO,
      umbralViable: 60,
      now: AHORA,
    });
    expect(resultado).toBeNull();
  });

  it('carril viable cuando el score alcanza el umbral, con razones vacias y explicacion no vacia', () => {
    const resultado = decideViability({
      score: score(80),
      capacidad: CAPACIDAD,
      afiliacion: AFILIADO,
      umbralViable: 60,
      now: AHORA,
    });
    expect(resultado).not.toBeNull();
    expect(resultado?.carril).toBe('viable');
    expect(resultado?.razones).toEqual([]);
    expect(resultado?.explicacion.length).toBeGreaterThan(0);
    expect(resultado?.decididoEn).toBe(AHORA);
  });

  it('carril no_viable cuando el score no alcanza el umbral, con al menos una razon', () => {
    const resultado = decideViability({
      score: score(30),
      capacidad: CAPACIDAD,
      afiliacion: AFILIADO,
      umbralViable: 60,
      now: AHORA,
    });
    expect(resultado?.carril).toBe('no_viable');
    expect(resultado?.razones.length).toBeGreaterThan(0);
  });

  it('incluye no_afiliado_sin_cupo entre las razones cuando un no-afiliado no es viable', () => {
    const resultado = decideViability({
      score: score(30),
      capacidad: CAPACIDAD,
      afiliacion: NO_AFILIADO,
      umbralViable: 60,
      now: AHORA,
    });
    expect(resultado?.razones).toContain('no_afiliado_sin_cupo');
  });

  it('incluye sin_capacidad cuando la banda es baja y el lead no es viable', () => {
    const capacidadBaja: CapacityBand = {
      banda: 'baja',
      faltantes: [],
      cuotaMensualEstimada: 100_000,
      precioMaximoEstimado: 5_000_000,
    };
    const resultado = decideViability({
      score: score(30),
      capacidad: capacidadBaja,
      afiliacion: AFILIADO,
      umbralViable: 60,
      now: AHORA,
    });
    expect(resultado?.razones).toContain('sin_capacidad');
  });
});
