import type { Request, RequestHandler } from 'express';
import type { SessionStorePort } from '../../../shared/application/ports/closer-auth.port.js';
import { asyncHandler } from '../../../shared/infrastructure/http/async-handler.js';
import { sendError } from '../../../shared/infrastructure/http/api-response.js';
import { UnauthorizedError } from '../../../shared/kernel/errors.js';

export const CLOSER_SESSION_COOKIE = 'closer_session';

export function readCloserSessionToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader === undefined) return null;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    const name = cookie.slice(0, separator).trim();
    if (name === CLOSER_SESSION_COOKIE) {
      const token = cookie.slice(separator + 1).trim();
      return token.length > 0 ? token : null;
    }
  }

  return null;
}

export function createRequireCloser(sessionStore: SessionStorePort): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const token = readCloserSessionToken(req);
    if (token === null) {
      sendError(res, new UnauthorizedError());
      return;
    }

    const result = await sessionStore.verify(token);
    if (!result.ok) {
      sendError(res, result.error);
      return;
    }

    res.locals.closer = result.value;
    next();
  });
}
