import type { Request, RequestHandler } from 'express';
import type { LeadSessionStorePort } from '@shared/application/ports/lead-auth.port.js';
import { asyncHandler } from '@shared/infrastructure/http/async-handler.js';
import { sendError } from '@shared/infrastructure/http/api-response.js';
import { LEAD_SESSION_COOKIE } from '@shared/infrastructure/http/lead-session-cookie.js';
import { UnauthorizedError } from '@shared/kernel/errors.js';

export { LEAD_SESSION_COOKIE };

export function readLeadSessionToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader === undefined) return null;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    const name = cookie.slice(0, separator).trim();
    if (name === LEAD_SESSION_COOKIE) {
      const token = cookie.slice(separator + 1).trim();
      return token.length > 0 ? token : null;
    }
  }

  return null;
}

/**
 * Guard de sesion de lead. F2.2 lo monta sobre `/journey` y `/progress`: el
 * OTP contra el correo que el propio lead declaro en F1 es la UNICA puerta al
 * modulo educativo. Antes esas rutas aceptaban cualquier `leadId` suelto, de
 * modo que el "login" no protegia nada — tener el id ya era tener acceso.
 */
export function createRequireLead(sessionStore: LeadSessionStorePort): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const token = readLeadSessionToken(req);
    if (token === null) {
      sendError(res, new UnauthorizedError());
      return;
    }

    const result = await sessionStore.verify(token);
    if (!result.ok) {
      sendError(res, result.error);
      return;
    }

    res.locals.lead = result.value;
    next();
  });
}

/** El `leadId` que pide la ruta, venga por query (`/journey`) o body (`/progress`). */
function leadIdSolicitado(req: Request): string | null {
  const enQuery = req.query.leadId;
  if (typeof enQuery === 'string' && enQuery.trim().length > 0) return enQuery.trim();

  const body: unknown = req.body;
  if (typeof body === 'object' && body !== null) {
    const { leadId } = body as { leadId?: unknown };
    if (typeof leadId === 'string' && leadId.trim().length > 0) return leadId.trim();
  }
  return null;
}

/**
 * Va SIEMPRE despues de `createRequireLead`: tener sesion no alcanza, tiene
 * que ser la del lead que se esta pidiendo. Sin esto un lead verificado podia
 * leer (y escribir progreso en) el camino de cualquier otro con solo cambiar
 * el `leadId` de la query — la sesion diria "ok" porque existe, sin mirar de
 * quien es. Se responde 401 y no 403 a proposito: el mismo error que "no hay
 * sesion" no revela si ese `leadId` existe.
 */
export function createRequireOwnLead(): RequestHandler {
  return (req, res, next) => {
    const pedido = leadIdSolicitado(req);
    const sesion = res.locals.lead as { leadId: string } | undefined;

    if (pedido === null || pedido !== sesion?.leadId) {
      sendError(res, new UnauthorizedError());
      return;
    }
    next();
  };
}
