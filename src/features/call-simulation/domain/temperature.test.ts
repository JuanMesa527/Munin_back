import { describe, expect, it } from 'vitest';
import { applyDelta } from './temperature.js';

describe('applyDelta', () => {
  it('suma un delta positivo normal', () => {
    expect(applyDelta(40, 10)).toBe(50);
  });

  it('resta un delta negativo normal', () => {
    expect(applyDelta(40, -10)).toBe(30);
  });

  it('nunca baja de 0, sin importar que tan negativo sea el delta', () => {
    expect(applyDelta(5, -50)).toBe(0);
  });

  it('nunca sube de 100, sin importar que tan positivo sea el delta', () => {
    expect(applyDelta(95, 50)).toBe(100);
  });

  it('redondea resultados fraccionarios', () => {
    expect(applyDelta(40.4, 0.4)).toBe(41);
  });
});
