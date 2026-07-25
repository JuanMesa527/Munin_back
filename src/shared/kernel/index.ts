/**
 * Barrel del kernel. Punto de entrada unico: `import { ok, err } from '@shared/kernel/index.js'`.
 * Capa: kernel. No agregues aqui nada que dependa de un framework.
 */

export * from './errors.js';
export * from './result.js';
