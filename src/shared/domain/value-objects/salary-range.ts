/**
 * Value object del rango salarial declarado por el lead, en multiplos de SMMLV.
 * Capa: domain compartido (puro, sin I/O).
 *
 * Guarda la etiqueta TAL COMO la declaro el lead porque el vocabulario todavia
 * no esta cerrado (del contrato: se confirma contra el Excel en `analysis/`).
 * La traduccion a numeros vive en una sola funcion auditable: de ahi cuelga el
 * umbral de 4 SMMLV del Subsidio Familiar de Vivienda.
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
 * Cotas numericas del rango. `desde` inclusivo,
 * `hasta` exclusivo, `hasta === null` para el tramo abierto (`>10 SMMLV`).
 */
export interface SmmlvBounds {
  readonly desde: number;
  readonly hasta: number | null;
}

/**
 * Constructor validado. Sin puerta de entrada cualquier string entraria al
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
 * Cotas numericas por etiqueta, en el mismo orden que
 * `RANGOS_SALARIALES_SMMLV`. Tabla explicita (no un parseo por regex del
 * string) para que el mapeo sea auditable linea por linea — exactamente lo que
 * pide.
 */
const COTAS_POR_ETIQUETA: Record<string, SmmlvBounds> = {
  '0-2 SMMLV': { desde: 0, hasta: 2 },
  '2-4 SMMLV': { desde: 2, hasta: 4 },
  '4-6 SMMLV': { desde: 4, hasta: 6 },
  '6-10 SMMLV': { desde: 6, hasta: 10 },
  '>10 SMMLV': { desde: 10, hasta: null },
};

/**
 * Parsea la etiqueta a cotas numericas.
 *
 * Es la unica puerta entre el texto declarado y la aritmetica del subsidio; el
 * vocabulario definitivo lo confirma el pipeline de `analysis/`. Si
 * `range.etiqueta` no esta en la tabla (no deberia pasar si vino de
 * `fromEtiqueta`, pero esta funcion no confia en eso), retorna `err` en vez de
 * adivinar una cota.
 */
export function toSmmlvBounds(range: SalaryRange): Result<SmmlvBounds, ValidationError> {
  const cotas = COTAS_POR_ETIQUETA[range.etiqueta];
  if (cotas === undefined) {
    return err(
      new ValidationError('Rango salarial fuera del vocabulario conocido', {
        rangoSalarial: 'valor no reconocido',
      }),
    );
  }
  return ok(cotas);
}
