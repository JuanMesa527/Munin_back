/**
 * Cobertura del guion y de las objeciones durante la llamada. Capa: domain
 * (funciones puras).
 *
 * GLASS-BOX: `talkingPointsUsados` de un turno NO sale de lo que el LLM diga
 * que uso — el LLM ni siquiera conoce los indices de
 * `BriefingSheet.talkingPoints`. Se calcula aqui, por coincidencia de palabras
 * significativas entre lo que el closer dijo y el propio punto del guion.
 */

import type { CallTurn, ObjecionSugerida, TalkingPoint } from '@contracts';
import { palabrasSignificativas } from './text.js';

/**
 * Cuantas palabras significativas deben coincidir para contar un punto como
 * cubierto. Un punto con pocas palabras clave (p. ej. 1) solo necesita esa
 * una; uno con vocabulario mas rico exige dos, para no marcar "cubierto" por
 * una sola palabra suelta y comun al resto del guion.
 */
function minimoCoincidencias(palabrasDelPunto: number): number {
  return Math.min(2, palabrasDelPunto);
}

function seToco(puntoTexto: string, closerDijo: string): boolean {
  const palabrasPunto = palabrasSignificativas(puntoTexto);
  if (palabrasPunto.size === 0) return false;

  const palabrasCloser = palabrasSignificativas(closerDijo);
  const compartidas = [...palabrasPunto].filter((palabra) => palabrasCloser.has(palabra));

  return compartidas.length >= minimoCoincidencias(palabrasPunto.size);
}

/**
 * Indices de `talkingPoints` que el texto de UN turno del closer cubrio.
 * La usa el caso de uso al recibir cada turno, para llenar `CallTurn.talkingPointsUsados`.
 */
export function detectTalkingPointsUsados(
  closerDijo: string,
  talkingPoints: readonly TalkingPoint[],
): number[] {
  return talkingPoints
    .map((punto, indice) => ({ indice, texto: `${punto.titulo} ${punto.detalle}` }))
    .filter(({ texto }) => seToco(texto, closerDijo))
    .map(({ indice }) => indice);
}

export interface CoverageSummary {
  usados: number[];
  ignorados: number[];
}

/**
 * Agrega la cobertura de TODA la llamada: union de lo usado en cada turno vs.
 * el complemento. Todo indice de `talkingPoints` cae en exactamente uno de los
 * dos arreglos (requisito de la spec).
 */
export function summarizeCoverage(
  turnos: readonly CallTurn[],
  talkingPoints: readonly TalkingPoint[],
): CoverageSummary {
  const usados = new Set<number>();
  for (const turno of turnos) {
    for (const indice of turno.talkingPointsUsados) {
      usados.add(indice);
    }
  }

  const ignorados = talkingPoints
    .map((_, indice) => indice)
    .filter((indice) => !usados.has(indice));

  return { usados: [...usados].sort((a, b) => a - b), ignorados };
}

export interface ObjectionCoverage {
  resueltas: string[];
  vivas: string[];
}

/**
 * Objeciones reales (texto identico a `BriefingSheet.objeciones`) que se
 * plantearon en la llamada y cuales de esas quedaron sin resolver. Una
 * objecion que nunca se planteo no cuenta como "viva": no se puede vivir algo
 * que no paso.
 */
export function summarizeObjectionCoverage(
  turnos: readonly CallTurn[],
  objeciones: readonly ObjecionSugerida[],
): ObjectionCoverage {
  const preguntasValidas = new Set(objeciones.map((o) => o.pregunta));

  const planteadas = new Set<string>();
  const resueltas = new Set<string>();
  for (const turno of turnos) {
    for (const p of turno.objecionesPlanteadas) {
      if (preguntasValidas.has(p)) planteadas.add(p);
    }
    for (const r of turno.objecionesResueltas) {
      if (preguntasValidas.has(r)) resueltas.add(r);
    }
  }

  const vivas = [...planteadas].filter((p) => !resueltas.has(p));

  return { resueltas: [...resueltas], vivas };
}
