/**
 * Result<T, E> — canal de errores ESPERADOS de todo el backend.
 * Capa: kernel (dominio purisimo, cero imports de framework y cero I/O).
 *
 * Existe para que un fallo de negocio sea un VALOR y no una excepcion: el caso
 * de uso devuelve `Result`, el borde HTTP decide el status. `throw` queda
 * reservado para bugs.
 */

import type { DomainError } from './errors.js';

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** `E` por defecto es `DomainError`: el 95% de los casos de uso no necesita mas. */
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Transforma el valor exitoso y deja pasar el error intacto. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Traduce el error sin tocar el valor. Util para reetiquetar errores de un adapter. */
export function mapErrResult<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
