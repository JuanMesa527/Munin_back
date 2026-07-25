/**
 * Validacion de entrada en el BORDE. Capa: infrastructure.
 *
 * OWASP A03 (inyeccion): ningun dato del cliente entra a un caso de uso sin
 * pasar por un schema de zod. El controller recibe datos ya estrechados, asi que
 * el dominio nunca tiene que preguntarse si un campo es del tipo que dice ser.
 * Los DTO tambien acotan LARGOS, que es lo que limita la inyeccion de prompt
 * cuando el texto libre va a parar al LLM.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../../kernel/errors.js';
import { sendError } from './api-response.js';

/** Convierte los issues de zod en el `fields` de `ApiError` (campo -> mensaje). */
function aFields(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const campo = issue.path.map(String).join('.');
    const clave = campo.length > 0 ? campo : '_';
    // Nos quedamos con el primer mensaje por campo: el frontend pinta uno.
    fields[clave] ??= issue.message;
  }
  return fields;
}

/**
 * Valida `req.body` y lo REEMPLAZA por la version parseada (zod descarta las
 * claves desconocidas, asi que nada que no este en el schema llega al handler).
 */
export function validateBody<S extends ZodType>(schema: S): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      sendError(
        res,
        new ValidationError('Datos de entrada no validos', aFields(resultado.error.issues)),
      );
      return;
    }
    req.body = resultado.data;
    next();
  };
}

/**
 * PROPUESTA AL EQUIPO: equivalente para query strings, que F3 necesita para
 * `ListLeadsQuerySchema`. En Express 5 `req.query` es un getter y no se puede
 * reasignar, asi que el valor parseado se deja en `res.locals.query` y se lee
 * con `readValidatedQuery`.
 */
export function validateQuery<S extends ZodType>(schema: S): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resultado = schema.safeParse(req.query);
    if (!resultado.success) {
      sendError(
        res,
        new ValidationError('Parametros de consulta no validos', aFields(resultado.error.issues)),
      );
      return;
    }
    res.locals.query = resultado.data;
    next();
  };
}

/** Lee lo que dejo `validateQuery`. Llamalo solo detras de ese middleware. */
export function readValidatedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
