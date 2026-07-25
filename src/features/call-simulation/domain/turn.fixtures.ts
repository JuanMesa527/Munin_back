/** Fixture de `CallTurn` para tests de dominio de call-simulation. */

import type { CallTurn } from '@contracts';

export function turnFixture(overrides: Partial<CallTurn> = {}): CallTurn {
  return {
    indice: 0,
    closerDijo: '',
    leadRespondio: 'Hola, ¿con quién hablo?',
    audio: null,
    mood: 'neutral',
    interes: 40,
    objecionesPlanteadas: [],
    objecionesResueltas: [],
    talkingPointsUsados: [],
    ocurridoEn: '2026-07-25T10:00:00.000Z',
    ...overrides,
  };
}
