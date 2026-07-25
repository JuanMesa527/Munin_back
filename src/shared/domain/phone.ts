/**
 * Helpers de telefono (capa domain compartida).
 *
 * MINIMIZACION (Ley 1581): el numero completo no debe circular en DTOs del
 * closer; solo los dos ultimos digitos quedan visibles en la mascara.
 */

/** Plantilla de presentacion fijada por el contrato: `+57 3.. ... ..42`. */
const PLANTILLA_ENMASCARADA = '+57 3.. ... ..';

/**
 * Deja visibles solo los dos ultimos digitos. Suficiente para confirmar
 * "termina en 42" sin que el numero completo circule.
 */
export function maskPhone(telefono: string): string {
  const digitos = telefono.replace(/\D/gu, '');
  const ultimos = digitos.slice(-2).padStart(2, '.');
  return `${PLANTILLA_ENMASCARADA}${ultimos}`;
}

/** Normaliza a solo digitos (sin +57 ni espacios). */
export function normalizePhoneDigits(telefono: string): string {
  return telefono.replace(/\D/gu, '');
}
