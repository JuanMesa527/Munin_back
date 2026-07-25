/**
 * Envoltura para handlers asincronos de Express. Capa: infrastructure.
 *
 * Express 5 ya reenvia las promesas rechazadas a `next`, pero mantenemos el
 * wrapper por dos razones: obliga por TIPOS a que el handler sea `async` (y no
 * uno que devuelva `void` y se coma el error), y deja explicito en cada ruta que
 * el fallo termina en `errorHandler` y no en un timeout silencioso.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
