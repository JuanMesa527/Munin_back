/**
 * Manejador de errores y 404 de Express 5. Capa: infrastructure.
 * Es la ultima red: cualquier excepcion que se escape de un controller termina
 * aqui y sale como `ApiResponse` en vez de como HTML de stack trace.
 *
 * OWASP A09 (fallas de logging y monitoreo) y fuga de informacion: el error
 * COMPLETO se loguea del lado servidor; al cliente solo le llega un mensaje
 * generico cuando no es un `DomainError`.
 */

import type { NextFunction, Request, Response } from 'express';
import { DomainError, isDomainError, NotFoundError } from '../../kernel/errors.js';
import { logger } from '../logging/logger.js';
import { sendError } from './api-response.js';

/**
 * 404 uniforme, montado despues de los modulos y antes de `errorHandler`. Sin esto, una ruta mal escrita
 * devuelve el HTML por defecto de Express y el frontend no puede parsearlo.
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn({ metodo: req.method, ruta: req.originalUrl }, 'ruta no encontrada');
  sendError(res, new NotFoundError('Ruta no encontrada'));
}

/**
 * `body-parser` marca este caso con `type: 'entity.too.large'`. Se mira esa
 * propiedad y no el `message`, que cambia entre versiones.
 */
function esPayloadDemasiadoGrande(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    err.type === 'entity.too.large'
  );
}

/**
 * Firma de 4 argumentos: asi es como Express 5 reconoce un middleware de error.
 * No la cambies ni le quites `next`, o Express lo tratara como middleware normal.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  // Si ya empezamos a escribir la respuesta no podemos cambiar el status:
  // se lo devolvemos a Express para que cierre la conexion.
  if (res.headersSent) {
    next(err);
    return;
  }

  // `err` completo (incluida la traza) solo del lado servidor. La ruta se
  // loguea porque en este API nunca lleva datos personales en el path.
  logger.error({ err, metodo: req.method, ruta: req.originalUrl }, 'fallo no controlado');

  if (isDomainError(err)) {
    sendError(res, err);
    return;
  }

  // Body que excede el techo de `express.json`. Es un fallo DEL CLIENTE y sale
  // del body parser, no de un controller, asi que sin este caso caia en el 500
  // generico de abajo: el front recibia "error inesperado" cuando el problema
  // era el tamano de lo que mando y podia corregirlo.
  if (esPayloadDemasiadoGrande(err)) {
    sendError(
      res,
      new DomainError('PAYLOAD_TOO_LARGE', 'El contenido enviado es demasiado grande.'),
      413,
    );
    return;
  }

  // Mensaje deliberadamente pobre: el detalle de un fallo inesperado le sirve
  // mas a un atacante que al usuario.
  sendError(
    res,
    new DomainError('INTERNAL_ERROR', 'Ocurrio un error inesperado. Intentalo de nuevo.'),
    500,
  );
}
