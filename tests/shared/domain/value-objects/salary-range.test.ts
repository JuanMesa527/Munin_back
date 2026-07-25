/**
 * Tests de `shared/domain/value-objects/salary-range.ts`. Feeds design D8's
 * inferencia de `segmento`.
 */

import { describe, expect, it } from 'vitest';
import {
  fromEtiqueta,
  toSmmlvBounds,
} from '../../../../src/shared/domain/value-objects/salary-range.js';

function bounds(etiqueta: string): ReturnType<typeof toSmmlvBounds> {
  const range = fromEtiqueta(etiqueta);
  if (!range.ok) {
    throw new Error(`fixture invalida: ${etiqueta}`);
  }
  return toSmmlvBounds(range.value);
}

describe('toSmmlvBounds', () => {
  it('parsea "0-2 SMMLV" a cotas cerradas', () => {
    const resultado = bounds('0-2 SMMLV');
    expect(resultado).toEqual({ ok: true, value: { desde: 0, hasta: 2 } });
  });

  it('parsea "2-4 SMMLV" a cotas cerradas', () => {
    const resultado = bounds('2-4 SMMLV');
    expect(resultado).toEqual({ ok: true, value: { desde: 2, hasta: 4 } });
  });

  it('parsea "4-6 SMMLV" a cotas cerradas', () => {
    const resultado = bounds('4-6 SMMLV');
    expect(resultado).toEqual({ ok: true, value: { desde: 4, hasta: 6 } });
  });

  it('parsea "6-10 SMMLV" a cotas cerradas', () => {
    const resultado = bounds('6-10 SMMLV');
    expect(resultado).toEqual({ ok: true, value: { desde: 6, hasta: 10 } });
  });

  it('parsea el tramo abierto ">10 SMMLV" con hasta null', () => {
    const resultado = bounds('>10 SMMLV');
    expect(resultado).toEqual({ ok: true, value: { desde: 10, hasta: null } });
  });
});
