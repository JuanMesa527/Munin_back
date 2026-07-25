import { describe, expect, it } from 'vitest';
import type { ObjecionSugerida, TalkingPoint } from '@contracts';
import {
  detectTalkingPointsUsados,
  summarizeCoverage,
  summarizeObjectionCoverage,
} from './coverage.js';
import { turnFixture } from './turn.fixtures.js';

const TALKING_POINTS: TalkingPoint[] = [
  {
    titulo: 'Menciona el subsidio estimado',
    detalle: 'Tiene 3 SMMLV: aplica al SFV.',
    origen: 'capacidad',
    prioridad: 1,
  },
  {
    titulo: 'Habla del proyecto con mejor match',
    detalle: 'El match top tiene 82% de afinidad.',
    origen: 'matching',
    prioridad: 2,
  },
];

const OBJECIONES: ObjecionSugerida[] = [
  { pregunta: 'Eso del subsidio, ¿de verdad me lo dan?', respuesta: 'Es un estimado.' },
  { pregunta: 'Es muy lejos de mi trabajo.', respuesta: 'Hay ruta directa.' },
];

describe('detectTalkingPointsUsados', () => {
  it('detecta un punto cuando el closer usa su vocabulario clave', () => {
    const indices = detectTalkingPointsUsados(
      'Recuerda que tienes un subsidio estimado por tu SMMLV',
      TALKING_POINTS,
    );
    expect(indices).toContain(0);
  });

  it('no marca nada cubierto con un saludo generico', () => {
    const indices = detectTalkingPointsUsados('Hola buenas tardes como estas', TALKING_POINTS);
    expect(indices).toEqual([]);
  });

  it('puede detectar varios puntos en el mismo turno', () => {
    const indices = detectTalkingPointsUsados(
      'Tienes subsidio estimado y ademas el proyecto con mejor match de afinidad',
      TALKING_POINTS,
    );
    expect(indices).toEqual([0, 1]);
  });
});

describe('summarizeCoverage', () => {
  it('todo indice cae en usados o en ignorados, nunca en ambos ni en ninguno', () => {
    const turnos = [
      turnFixture({ talkingPointsUsados: [0] }),
      turnFixture({ talkingPointsUsados: [] }),
    ];
    const { usados, ignorados } = summarizeCoverage(turnos, TALKING_POINTS);

    expect(usados.length + ignorados.length).toBe(TALKING_POINTS.length);
    expect(usados).not.toEqual(expect.arrayContaining(ignorados));
    expect(usados).toEqual([0]);
    expect(ignorados).toEqual([1]);
  });

  it('sin turnos que cubran nada, todos quedan ignorados', () => {
    const { usados, ignorados } = summarizeCoverage([turnFixture()], TALKING_POINTS);
    expect(usados).toEqual([]);
    expect(ignorados).toEqual([0, 1]);
  });
});

describe('summarizeObjectionCoverage', () => {
  it('una objecion planteada y resuelta cuenta como resuelta, no como viva', () => {
    const turnos = [
      turnFixture({
        objecionesPlanteadas: [OBJECIONES[0]?.pregunta ?? ''],
        objecionesResueltas: [OBJECIONES[0]?.pregunta ?? ''],
      }),
    ];
    const { resueltas, vivas } = summarizeObjectionCoverage(turnos, OBJECIONES);
    expect(resueltas).toEqual([OBJECIONES[0]?.pregunta]);
    expect(vivas).toEqual([]);
  });

  it('una objecion planteada y nunca resuelta queda viva', () => {
    const turnos = [
      turnFixture({ objecionesPlanteadas: [OBJECIONES[1]?.pregunta ?? ''] }),
    ];
    const { resueltas, vivas } = summarizeObjectionCoverage(turnos, OBJECIONES);
    expect(resueltas).toEqual([]);
    expect(vivas).toEqual([OBJECIONES[1]?.pregunta]);
  });

  it('ignora texto que no coincide con ninguna objecion real (LLM alucinando)', () => {
    const turnos = [
      turnFixture({ objecionesPlanteadas: ['una objecion inventada que no esta en el guion'] }),
    ];
    const { resueltas, vivas } = summarizeObjectionCoverage(turnos, OBJECIONES);
    expect(resueltas).toEqual([]);
    expect(vivas).toEqual([]);
  });
});
