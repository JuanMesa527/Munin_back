import { describe, expect, it } from 'vitest';
import { detectForbiddenPromises } from './compliance.js';
import { turnFixture } from './turn.fixtures.js';

describe('detectForbiddenPromises', () => {
  it('marca una promesa de aprobacion', () => {
    const alertas = detectForbiddenPromises([
      turnFixture({ indice: 2, closerDijo: 'Tranquila, tu credito ya esta aprobado' }),
    ]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toContain('Turno 2');
  });

  it('marca variantes acentuadas y en mayusculas igual', () => {
    const alertas = detectForbiddenPromises([
      turnFixture({ closerDijo: 'TE LO GARANTIZO, no te preocupes' }),
    ]);
    expect(alertas).toHaveLength(1);
  });

  it('no marca "estimado": la palabra correcta del proyecto', () => {
    const alertas = detectForbiddenPromises([
      turnFixture({ closerDijo: 'Tu subsidio estimado es de 15 millones' }),
    ]);
    expect(alertas).toEqual([]);
  });

  it('no marca nada en una llamada limpia', () => {
    const alertas = detectForbiddenPromises([
      turnFixture({ closerDijo: 'Cuentame un poco de tu situacion actual' }),
      turnFixture({ closerDijo: 'Con gusto agendamos una visita al proyecto' }),
    ]);
    expect(alertas).toEqual([]);
  });

  it('un turno con dos frases prohibidas solo genera una alerta (no duplica)', () => {
    const alertas = detectForbiddenPromises([
      turnFixture({ closerDijo: 'Esta garantizado, esta aprobado, no hay duda' }),
    ]);
    expect(alertas).toHaveLength(1);
  });
});
