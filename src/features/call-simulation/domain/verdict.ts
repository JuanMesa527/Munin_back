/**
 * Veredicto de la llamada simulada. Capa: domain (funcion pura).
 *
 * GLASS-BOX: el `outcome` y el `puntaje` NUNCA los decide el LLM. El LLM solo
 * reporta senal turno a turno (`interes`, objeciones); esta funcion — pura,
 * testeada, sin I/O — es la unica que convierte esa senal en el veredicto. Ante
 * un jurado que pregunte "¿por que dice que cerro?", la respuesta es esta
 * aritmetica, no la opinion de un modelo (misma disciplina que
 * `ScoreResult.factores` en el scoring de leads).
 */

import type {
  CallDifficulty,
  CallOutcome,
  CallScorecard,
  CallTurn,
  Factor,
  IsoDateTime,
  ObjecionSugerida,
  TalkingPoint,
} from '@contracts';
import { detectForbiddenPromises } from './compliance.js';
import { summarizeCoverage, summarizeObjectionCoverage } from './coverage.js';
import { INTERES_INICIAL } from './temperature.js';

export interface Umbrales {
  /** Interes minimo para `outcome: 'agenda_visita'`. */
  agendaVisita: number;
  /** Interes minimo para `outcome: 'lo_piensa'`; por debajo, `'no_cierra'`. */
  loPiensa: number;
}

/**
 * Umbral MAS ALTO a mayor dificultad: una dificultad dura hace al personaje mas
 * dificil de convencer (via `persona.ts`), nunca reduce lo que hace falta para
 * ganar.
 */
export const UMBRALES: Record<CallDifficulty, Umbrales> = {
  receptivo: { agendaVisita: 55, loPiensa: 35 },
  realista: { agendaVisita: 65, loPiensa: 40 },
  dificil: { agendaVisita: 75, loPiensa: 45 },
};

const PESO_INTERES = 55;
const PESO_COBERTURA = 25;
const PESO_OBJECIONES = 20;

/** Puntos que resta cada alerta de cumplimiento. Nunca deja el puntaje negativo. */
const PENALIZACION_POR_ALERTA = 15;

function explicar(
  outcome: CallOutcome,
  interesFinal: number,
  ignorados: number,
  alertas: number,
): string {
  const partes: string[] = [];

  switch (outcome) {
    case 'agenda_visita':
      partes.push(
        `Interes final de ${String(interesFinal)}/100 y sin objeciones vivas: cierra en ` +
          'agenda de visita.',
      );
      break;
    case 'lo_piensa':
      partes.push(
        `Interes final de ${String(interesFinal)}/100: alcanza para dejarlo pensando, no ` +
          'para cerrar hoy.',
      );
      break;
    case 'no_cierra':
      partes.push(
        `Interes final de ${String(interesFinal)}/100: no alcanza el umbral de cierre para ` +
          'esta dificultad.',
      );
      break;
    case 'colgo':
      partes.push(
        'La llamada termino antes de que el closer dijera nada: no hay turnos que evaluar.',
      );
      break;
  }

  if (ignorados > 0) {
    partes.push(`Quedaron ${String(ignorados)} punto(s) del guion sin usar.`);
  }
  if (alertas > 0) {
    partes.push(`Se detectaron ${String(alertas)} promesa(s) que la caja no puede garantizar.`);
  }

  return partes.join(' ');
}

export interface ComputeVerdictInput {
  /** Todos los turnos de la sesion, INCLUIDA la apertura en el indice 0. */
  turnos: readonly CallTurn[];
  talkingPoints: readonly TalkingPoint[];
  objeciones: readonly ObjecionSugerida[];
  dificultad: CallDifficulty;
  iniciadaEn: IsoDateTime;
  terminadaEn: IsoDateTime;
}

/**
 * Desglose del puntaje, en los mismos terminos que `ScoreResult.factores` del
 * scoring de leads (glass-box).
 *
 * Existe porque el dial del veredicto y el `interesFinal` son numeros DISTINTOS
 * y sin esto parecian contradecirse: el interes mide al LEAD, el puntaje mide
 * al CLOSER. Aqui se ve de donde sale cada punto.
 */
function construirFactores(input: {
  interesFinal: number;
  ratioCobertura: number;
  ratioObjeciones: number;
  usados: number;
  totalTalkingPoints: number;
  resueltas: number;
  totalObjeciones: number;
  alertas: number;
}): Factor[] {
  const factores: Factor[] = [
    {
      nombre: 'Interes que lograste',
      peso: PESO_INTERES,
      valor: `${String(input.interesFinal)}/100`,
      contribucion: Math.round((input.interesFinal / 100) * PESO_INTERES),
      intensidad: input.interesFinal,
    },
    {
      nombre: 'Guion cubierto',
      peso: PESO_COBERTURA,
      valor: `${String(input.usados)} de ${String(input.totalTalkingPoints)} puntos`,
      contribucion: Math.round(input.ratioCobertura * PESO_COBERTURA),
      intensidad: Math.round(input.ratioCobertura * 100),
    },
    {
      nombre: 'Objeciones resueltas',
      peso: PESO_OBJECIONES,
      valor: `${String(input.resueltas)} de ${String(input.totalObjeciones)}`,
      contribucion: Math.round(input.ratioObjeciones * PESO_OBJECIONES),
      intensidad: Math.round(input.ratioObjeciones * 100),
    },
  ];

  // Solo aparece cuando de verdad hubo incumplimientos: un factor en cero
  // permanente ensucia la lectura y sugiere que siempre se penaliza algo.
  if (input.alertas > 0) {
    factores.push({
      nombre: 'Promesas no permitidas',
      peso: PENALIZACION_POR_ALERTA,
      valor: `${String(input.alertas)} alerta(s)`,
      contribucion: -(input.alertas * PENALIZACION_POR_ALERTA),
      intensidad: 0,
    });
  }

  return factores;
}

/**
 * Calcula el `CallScorecard` completo a partir de la sesion terminada. Pura:
 * mismos turnos + misma dificultad -> mismo veredicto, siempre.
 */
export function computeVerdict(input: ComputeVerdictInput): CallScorecard {
  const { turnos, talkingPoints, objeciones, dificultad, iniciadaEn, terminadaEn } = input;

  const curvaInteres = turnos.map((turno) => turno.interes);
  const interesFinal = curvaInteres.at(-1) ?? INTERES_INICIAL;
  // El closer nunca hablo: solo esta la apertura del lead. `colgo`, no un cierre a medias.
  const intercambios = Math.max(0, turnos.length - 1);

  const cobertura = summarizeCoverage(turnos, talkingPoints);
  const objecionesCov = summarizeObjectionCoverage(turnos, objeciones);
  const alertas = detectForbiddenPromises(turnos);

  const umbral = UMBRALES[dificultad];

  let outcome: CallOutcome;
  if (intercambios === 0) {
    outcome = 'colgo';
  } else if (interesFinal >= umbral.agendaVisita && objecionesCov.vivas.length === 0) {
    outcome = 'agenda_visita';
  } else if (interesFinal >= umbral.loPiensa) {
    outcome = 'lo_piensa';
  } else {
    outcome = 'no_cierra';
  }

  const ratioCobertura =
    talkingPoints.length === 0 ? 1 : cobertura.usados.length / talkingPoints.length;
  const ratioObjeciones =
    objeciones.length === 0 ? 1 : objecionesCov.resueltas.length / objeciones.length;

  const puntajeBase =
    (interesFinal / 100) * PESO_INTERES +
    ratioCobertura * PESO_COBERTURA +
    ratioObjeciones * PESO_OBJECIONES;
  const penalizacion = alertas.length * PENALIZACION_POR_ALERTA;
  const puntaje = Math.round(Math.min(100, Math.max(0, puntajeBase - penalizacion)));

  const duracionSegundos = Math.max(
    0,
    Math.round((Date.parse(terminadaEn) - Date.parse(iniciadaEn)) / 1000),
  );

  return {
    outcome,
    puntaje,
    interesFinal,
    curvaInteres,
    talkingPointsUsados: cobertura.usados,
    talkingPointsIgnorados: cobertura.ignorados,
    objecionesResueltas: objecionesCov.resueltas,
    objecionesVivas: objecionesCov.vivas,
    factores: construirFactores({
      interesFinal,
      ratioCobertura,
      ratioObjeciones,
      usados: cobertura.usados.length,
      totalTalkingPoints: talkingPoints.length,
      resueltas: objecionesCov.resueltas.length,
      totalObjeciones: objeciones.length,
      alertas: alertas.length,
    }),
    duracionSegundos,
    turnos: intercambios,
    explicacion: explicar(outcome, interesFinal, cobertura.ignorados.length, alertas.length),
    alertas,
    // Los redacta el LLM DESPUES, en `end-call`: el dominio es puro y no hace
    // I/O. Que nazca en `null` deja explicito que el veredicto se sostiene
    // solo, sin narrativa.
    highlights: null,
  };
}
