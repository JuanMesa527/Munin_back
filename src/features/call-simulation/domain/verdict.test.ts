import { describe, expect, it } from 'vitest';
import type { CallDifficulty, ObjecionSugerida, TalkingPoint } from '@contracts';
import { turnFixture } from './turn.fixtures.js';
import { computeVerdict, type ComputeVerdictInput } from './verdict.js';

const TALKING_POINTS: TalkingPoint[] = [
  { titulo: 'Menciona el subsidio estimado', detalle: 'Aplica al SFV.', origen: 'capacidad', prioridad: 1 },
  { titulo: 'Habla del proyecto top', detalle: '82% de afinidad.', origen: 'matching', prioridad: 2 },
];

const OBJECIONES: ObjecionSugerida[] = [
  { pregunta: '¿De verdad me dan el subsidio?', respuesta: 'Es un estimado.' },
];

function baseInput(overrides: Partial<ComputeVerdictInput> = {}): ComputeVerdictInput {
  return {
    turnos: [turnFixture({ indice: 0, interes: 40 })],
    talkingPoints: TALKING_POINTS,
    objeciones: OBJECIONES,
    dificultad: 'realista',
    iniciadaEn: '2026-07-25T10:00:00.000Z',
    terminadaEn: '2026-07-25T10:05:00.000Z',
    ...overrides,
  };
}

describe('computeVerdict', () => {
  it('es reproducible: mismos turnos, mismo veredicto', () => {
    const input = baseInput({
      turnos: [
        turnFixture({ indice: 0, interes: 40 }),
        turnFixture({ indice: 1, interes: 70, talkingPointsUsados: [0, 1] }),
      ],
    });

    expect(computeVerdict(input)).toEqual(computeVerdict(input));
  });

  it('sin turnos del closer (solo la apertura), el outcome es "colgo"', () => {
    const scorecard = computeVerdict(baseInput());
    expect(scorecard.outcome).toBe('colgo');
    expect(scorecard.turnos).toBe(0);
  });

  it('interes alto y sin objeciones vivas cierra en agenda_visita', () => {
    const scorecard = computeVerdict(
      baseInput({
        turnos: [
          turnFixture({ indice: 0, interes: 40 }),
          turnFixture({
            indice: 1,
            interes: 80,
            talkingPointsUsados: [0, 1],
            objecionesPlanteadas: [OBJECIONES[0]?.pregunta ?? ''],
            objecionesResueltas: [OBJECIONES[0]?.pregunta ?? ''],
          }),
        ],
      }),
    );
    expect(scorecard.outcome).toBe('agenda_visita');
  });

  it('interes alto pero con una objecion viva NO cierra, aunque supere el umbral', () => {
    const scorecard = computeVerdict(
      baseInput({
        turnos: [
          turnFixture({ indice: 0, interes: 40 }),
          turnFixture({
            indice: 1,
            interes: 90,
            objecionesPlanteadas: [OBJECIONES[0]?.pregunta ?? ''],
          }),
        ],
      }),
    );
    expect(scorecard.outcome).not.toBe('agenda_visita');
  });

  it('interes bajo nunca cierra', () => {
    const scorecard = computeVerdict(
      baseInput({ turnos: [turnFixture({ indice: 0, interes: 40 }), turnFixture({ indice: 1, interes: 10 })] }),
    );
    expect(scorecard.outcome).toBe('no_cierra');
  });

  it('a mayor dificultad, el umbral requerido para cerrar es mas alto', () => {
    const turnosIguales = [
      turnFixture({ indice: 0, interes: 40 }),
      turnFixture({ indice: 1, interes: 62, talkingPointsUsados: [0, 1] }),
    ];

    const resultados = (['receptivo', 'realista', 'dificil'] as CallDifficulty[]).map(
      (dificultad) => computeVerdict(baseInput({ turnos: turnosIguales, dificultad })).outcome,
    );

    // 62 de interes: alcanza el umbral receptivo (55) pero no el realista/dificil (65/75).
    expect(resultados[0]).toBe('agenda_visita');
    expect(resultados[1]).not.toBe('agenda_visita');
    expect(resultados[2]).not.toBe('agenda_visita');
  });

  it('una promesa prohibida deja alerta incluso en una llamada que cierra', () => {
    const scorecard = computeVerdict(
      baseInput({
        turnos: [
          turnFixture({ indice: 0, interes: 40 }),
          turnFixture({
            indice: 1,
            interes: 90,
            closerDijo: 'tu credito ya esta aprobado',
            talkingPointsUsados: [0, 1],
            objecionesPlanteadas: [OBJECIONES[0]?.pregunta ?? ''],
            objecionesResueltas: [OBJECIONES[0]?.pregunta ?? ''],
          }),
        ],
      }),
    );
    expect(scorecard.outcome).toBe('agenda_visita');
    expect(scorecard.alertas.length).toBeGreaterThan(0);
  });

  it('la curva de interes tiene un punto por turno, incluida la apertura', () => {
    const scorecard = computeVerdict(
      baseInput({
        turnos: [
          turnFixture({ indice: 0, interes: 40 }),
          turnFixture({ indice: 1, interes: 55 }),
          turnFixture({ indice: 2, interes: 60 }),
        ],
      }),
    );
    expect(scorecard.curvaInteres).toEqual([40, 55, 60]);
  });

  it('el puntaje nunca sale de 0..100', () => {
    const scorecard = computeVerdict(
      baseInput({
        turnos: [
          turnFixture({ indice: 0, interes: 40 }),
          turnFixture({ indice: 1, interes: 100, closerDijo: 'esta garantizado, te lo garantizo, seguro te dan el subsidio' }),
        ],
      }),
    );
    expect(scorecard.puntaje).toBeGreaterThanOrEqual(0);
    expect(scorecard.puntaje).toBeLessThanOrEqual(100);
  });
});
