/**
 * Barrel del dominio compartido. Capa: domain.
 *
 * Para aritmetica de dinero conviene importar el modulo completo y no los
 * nombres sueltos, porque `add`/`subtract` solos no dicen de que hablan:
 *   import * as money from '@shared/domain/value-objects/money.js';
 */

export * from './lead.js';
export * from './value-objects/money.js';
export * from './value-objects/salary-range.js';
