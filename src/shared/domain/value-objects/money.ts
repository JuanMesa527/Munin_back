/**
 * Value object de dinero. Capa: domain compartido (puro, sin I/O).
 * Envuelve `COP` para que un monto en pesos no se confunda con miles ni con
 * multiplos de SMMLV — en este reto ese error ya existe dentro de los datos.
 *
 * TRAMPA DE DATOS #1 del reto: en el Excel de compradores el valor de vivienda
 * viene con ceros de menos (`523.620` significa ~523 millones). Esa correccion
 * ocurre UNA sola vez, en el pipeline offline de `analysis/`. Aqui todo llega ya
 * normalizado a pesos enteros (523_620_000): este archivo NUNCA multiplica ni
 * divide por 1000.
 */

import type { COP } from '@contracts';
import { ValidationError } from '../../kernel/errors.js';
import type { Result } from '../../kernel/result.js';
import { err, ok } from '../../kernel/result.js';

export interface Money {
  readonly pesos: COP;
}

/**
 * Unico constructor. Rechaza decimales y valores fuera del entero seguro de JS
 * (un precio de vivienda cabe de sobra, un dato basura no).
 *
 * NO rechaza negativos a proposito: el `gap` del plan de nutricion se calcula
 * como `precio - ahorro - subsidio` y puede quedar negativo cuando el hogar ya
 * cubre el objetivo. Para eso existe `isNegative`.
 */
export function fromPesos(pesos: COP): Result<Money, ValidationError> {
  if (!Number.isSafeInteger(pesos)) {
    return err(
      new ValidationError('El monto debe ser un numero entero de pesos', {
        pesos: 'debe ser un entero en pesos, sin decimales',
      }),
    );
  }
  return ok({ pesos });
}

export function toPesos(money: Money): COP {
  return money.pesos;
}

export function add(a: Money, b: Money): Money {
  return { pesos: a.pesos + b.pesos };
}

export function subtract(a: Money, b: Money): Money {
  return { pesos: a.pesos - b.pesos };
}

export function isNegative(money: Money): boolean {
  return money.pesos < 0;
}
