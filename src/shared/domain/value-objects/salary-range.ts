/**
 * Value object del rango salarial declarado por el lead, en multiplos de SMMLV.
 * Capa: domain compartido (puro, sin I/O).
 *
 * Guarda la etiqueta TAL COMO la declaro el lead porque el vocabulario todavia
 * no esta cerrado (adenda A7 del contrato: se confirma contra el Excel en
 * `analysis/`). La traduccion a numeros vive en una sola funcion auditable:
 * de ahi cuelga el umbral de 4 SMMLV del Subsidio Familiar de Vivienda.
 *
 * Convencion de scaffolding: un parametro con prefijo `_` significa "el cuerpo
 * todavia es un stub"; quita el `_` al implementar.
 */

import { RANGOS_SALARIALES_SMMLV } from '@contracts';
import { ValidationError } from '../../kernel/errors.js';
import type { Result } from '../../kernel/result.js';
import { err, ok } from '../../kernel/result.js';

export interface SalaryRange {
  /** Etiqueta del vocabulario de `RANGOS_SALARIALES_SMMLV`, p. ej. `2-4 SMMLV`. */
  readonly etiqueta: string;
}

/**
 * PROPUESTA AL EQUIPO: cotas numericas del rango. `desde` inclusivo,
 * `hasta` exclusivo, `hasta === null` para el tramo abierto (`>10 SMMLV`).
 */
export interface SmmlvBounds {
  readonly desde: number;
  readonly hasta: number | null;
}

/**
 * PROPUESTA AL EQUIPO: constructor validado. El manifiesto solo nombra
 * `toSmmlvBounds`, pero sin puerta de entrada cualquier string entraria al
 * dominio y el scoring dejaria de ser explicable.
 */
export function fromEtiqueta(etiqueta: string): Result<SalaryRange, ValidationError> {
  const normalizada = etiqueta.trim();
  if (!RANGOS_SALARIALES_SMMLV.includes(normalizada)) {
    return err(
      new ValidationError('Rango salarial fuera del vocabulario conocido', {
        rangoSalarial: 'valor no reconocido',
      }),
    );
  }
  return ok({ etiqueta: normalizada });
}

/**
 * TODO(F1): parsear la etiqueta a cotas numericas.
 *
 * Va como stub y no como parseo rapido a proposito: es la unica puerta entre el
 * texto declarado y la aritmetica del subsidio, y el vocabulario definitivo lo
 * confirma el pipeline de `analysis/` (adenda A7). Un parseo improvisado aqui
 * se convierte en una decision de viabilidad equivocada aguas abajo.
 */
export function toSmmlvBounds(_range: SalaryRange): Result<SmmlvBounds, ValidationError> {
  throw new Error('TODO: not implemented');
}
