import type { Request, RequestHandler } from 'express';
import type { LeadSessionStorePort } from '@shared/application/ports/lead-auth.port.js';
import { asyncHandler } from '@shared/infrastructure/http/async-handler.js';
import { sendError } from '@shared/infrastructure/http/api-response.js';
import { UnauthorizedError } from '@shared/kernel/errors.js';

export const LEAD_SESSION_COOKIE = 'lead_session';

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
 * Guard opcional para rutas que quieran exigir sesion de lead. F2.2 NO lo
 * monta hoy sobre `/journey`/`/progress` (siguen aceptando `leadId` directo,
 * igual que antes): el login por OTP es un canal ADICIONAL para recuperar el
 * `leadId` cuando el usuario perdio el que tenia en `localStorage`, no un
 * reemplazo del flujo autogestionado existente.
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
