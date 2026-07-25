/**
 * Decision final de enrutamiento de F1 (lead-intake). Capa: domain (puro).
 * Determinista y explicable (EQUIPO.md regla 12): nunca recibe `LlmPort`.
 */

import type {
  CapacityBand,
  IsoDateTime,
  NonViableReason,
  RoutingDecision,
  ScoreResult,
} from '@contracts';
import type { AffiliationCheck } from './profiling.js';

function construirRazones(
  capacidad: CapacityBand,
  afiliacion: AffiliationCheck,
): NonViableReason[] {
  const razones: NonViableReason[] = [];
  if (capacidad.banda === 'baja') {
    razones.push('sin_capacidad');
  }
  if (capacidad.precioMaximoEstimado !== null && capacidad.precioMaximoEstimado <= 0) {
    razones.push('ahorro_insuficiente');
  }
  if (!afiliacion.esAfiliado && afiliacion.aplicaCupo9010) {
    razones.push('no_afiliado_sin_cupo');
  }
  // Nunca dejar `razones` vacio en un `no_viable`: si ninguna razon estructural
  // aplico, el score bajo por si solo sigue siendo el motivo.
  if (razones.length === 0) {
    razones.push('score_bajo');
  }
  return razones;
}

/**
 * `null` iff `score === null || capacidad === null` (design.md D4): "sin
 * evidencia, sin decision" vive en esta unica funcion pura y testeable.
 */
export function decideViability(input: {
  score: ScoreResult | null;
  capacidad: CapacityBand | null;
  afiliacion: AffiliationCheck;
  umbralViable: number;
  now: IsoDateTime;
}): RoutingDecision | null {
  const { score, capacidad, afiliacion, umbralViable, now } = input;

  if (score === null || capacidad === null) {
    return null;
  }

  const esViable = score.valor >= umbralViable;

  if (esViable) {
    return {
      carril: 'viable',
      razones: [],
      explicacion: `Tu perfil califica como viable con un puntaje estimado de ${String(score.valor)}/100.`,
      decididoEn: now,
    };
  }

  const razones = construirRazones(capacidad, afiliacion);
  return {
    carril: 'no_viable',
    razones,
    explicacion: `Tu perfil todavía no califica como viable (puntaje estimado ${String(score.valor)}/100).`,
    decididoEn: now,
  };
}
