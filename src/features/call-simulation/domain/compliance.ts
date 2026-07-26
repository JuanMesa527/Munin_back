/**
 * Deteccion de promesas prohibidas del closer durante la llamada simulada.
 * Capa: domain (funcion pura).
 *
 * Regla del proyecto (misma que `deepseek-llm.adapter.ts` le exige al LLM):
 * la caja ESTIMA, nunca APRUEBA. Aqui se aplica al lado humano de la llamada:
 * si el closer promete una aprobacion, el scorecard lo marca aunque la
 * llamada cierre.
 */

import type { CallTurn } from '@contracts';
import { normalizar } from './text.js';

/** Frases ya normalizadas (sin tildes, minusculas) que nunca deberian salir del closer. */
const FRASES_PROHIBIDAS: readonly string[] = [
  'esta aprobado',
  'ya esta aprobado',
  'te lo aprueban',
  'te aprueban',
  'seguro te dan el subsidio',
  'seguro te lo dan',
  'garantizado',
  'aprobacion garantizada',
  'sin falta te lo dan',
  'te lo garantizo',
];

/**
 * Alertas de incumplimiento, una por turno donde el closer prometio algo que la
 * caja no puede garantizar. Corre independiente del `outcome`: una llamada
 * puede cerrar Y llevar una alerta.
 */
export function detectForbiddenPromises(turnos: readonly CallTurn[]): string[] {
  const alertas: string[] = [];

  for (const turno of turnos) {
    if (turno.closerDijo.length === 0) continue;

    const texto = normalizar(turno.closerDijo);
    const frase = FRASES_PROHIBIDAS.find((candidata) => texto.includes(candidata));
    if (frase !== undefined) {
      alertas.push(
        `Turno ${String(turno.indice)}: el closer prometio algo que la caja no puede ` +
          `garantizar ("${frase}"). La caja estima, nunca aprueba.`,
      );
    }
  }

  return alertas;
}
