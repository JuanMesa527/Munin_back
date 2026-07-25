/**
 * Traduccion de resultados de dominio a respuestas HTTP. Capa: infrastructure.
 * Todo lo que sale del backend usa la envoltura `ApiResponse<T>` del contrato,
 * para que el frontend tenga UNA sola forma de ramificar exito vs error.
 *
 * OWASP A09 / fuga de informacion: aqui se decide que ve el cliente. Nunca
 * serializamos `stack`, `cause` ni el error crudo; solo `code`, `message` y
 * `fields`, que son los tres campos del contrato.
 */

import type { Response } from 'express';
import type { ApiError, ApiResponse } from '@contracts';
import type { DomainError } from '../../kernel/errors.js';
import { ERROR_CODES } from '../../kernel/errors.js';

/**
 * Mapa codigo de dominio -> status HTTP. Vive en infrastructure porque el
 * dominio no conoce HTTP.
 *
 * `CONSENT_REQUIRED` es 403 y no 400: el cliente esta bien formado, lo que falta
 * es una autorizacion del titular sobre sus datos.
 */
const STATUS_POR_CODIGO: Record<string, number> = {
  [ERROR_CODES.validation]: 400,
  [ERROR_CODES.unauthorized]: 401,
  [ERROR_CODES.forbidden]: 403,
  [ERROR_CODES.consentRequired]: 403,
  [ERROR_CODES.notFound]: 404,
  [ERROR_CODES.conflict]: 409,
  [ERROR_CODES.dataUnavailable]: 503,
};

/** Un codigo desconocido es un bug nuestro, no un error del cliente: 500. */
export function statusForError(error: DomainError): number {
  return STATUS_POR_CODIGO[error.code] ?? 500;
}

export function sendOk<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { ok: true, data };
  res.status(status).json(body);
}

export function sendError(res: Response, error: DomainError, status?: number): void {
  const apiError: ApiError = {
    code: error.code,
    message: error.message,
    fields: error.fields,
  };
  const body: ApiResponse<never> = { ok: false, error: apiError };
  res.status(status ?? statusForError(error)).json(body);
}
