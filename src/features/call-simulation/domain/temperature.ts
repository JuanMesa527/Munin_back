/**
 * Termometro de interes de la llamada. Capa: domain (funcion pura).
 *
 * El LLM reporta `deltaInteres` por turno (cuanto subio o bajo el interes de
 * la persona simulada). Esta funcion es la UNICA que aplica ese delta al
 * acumulado y lo clampa: el LLM nunca escribe directamente el `interes` final,
 * asi que un delta fuera de rango no puede sacar el numero de 0-100.
 */

const INTERES_MINIMO = 0;
const INTERES_MAXIMO = 100;

/** Aplica un delta reportado por el LLM al interes acumulado, clampado 0-100. */
export function applyDelta(interesActual: number, delta: number): number {
  const siguiente = interesActual + delta;
  return Math.min(INTERES_MAXIMO, Math.max(INTERES_MINIMO, Math.round(siguiente)));
}

/** Interes inicial de una sesion nueva: ni frio ni convencido, punto neutro. */
export const INTERES_INICIAL = 40;
