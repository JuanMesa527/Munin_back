import { Router } from 'express';
import type { CookieOptions, Request, Response } from 'express';
import { API_ROUTES } from '@contracts';
import type {
  CloserAuthPort,
  SessionStorePort,
} from '../../../shared/application/ports/closer-auth.port.js';
import { asyncHandler } from '../../../shared/infrastructure/http/async-handler.js';
import { sendError, sendOk } from '../../../shared/infrastructure/http/api-response.js';
import { validateBody } from '../../../shared/infrastructure/http/validate.js';
import { UnauthorizedError } from '../../../shared/kernel/errors.js';
import type { CloserLoginBody } from './closer-auth.dto.js';
import { CloserLoginBodySchema } from './closer-auth.dto.js';
import { CLOSER_SESSION_COOKIE, readCloserSessionToken } from './require-closer.js';

export interface CloserAuthControllerDeps {
  readonly auth: CloserAuthPort;
  readonly sessionStore: SessionStorePort;
  readonly secureCookie: boolean;
  readonly sessionTtlMinutes: number;
}

function cookieOptions(deps: CloserAuthControllerDeps): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: deps.secureCookie,
    path: '/',
    maxAge: deps.sessionTtlMinutes * 60 * 1000,
  };
}

function clearCookieOptions(deps: CloserAuthControllerDeps): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: deps.secureCookie,
    path: '/',
  };
}

export function createCloserAuthPublicRouter(deps: CloserAuthControllerDeps): Router {
  const router = Router();

  router.post(
    API_ROUTES.closer.login,
    validateBody(CloserLoginBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const credentials = req.body as CloserLoginBody;
      const authenticated = await deps.auth.verifyCredentials(credentials);
      if (!authenticated.ok) {
        sendError(res, authenticated.error);
        return;
      }

      const issued = await deps.sessionStore.issue(authenticated.value);
      if (!issued.ok) {
        sendError(res, issued.error);
        return;
      }

      res.cookie(CLOSER_SESSION_COOKIE, issued.value.token, cookieOptions(deps));
      sendOk(res, authenticated.value);
    }),
  );

  return router;
}

export function createCloserAuthProtectedRouter(deps: CloserAuthControllerDeps): Router {
  const router = Router();

  router.post(
    API_ROUTES.closer.logout,
    asyncHandler(async (req: Request, res: Response) => {
      const token = readCloserSessionToken(req);
      if (token !== null) {
        const revoked = await deps.sessionStore.revoke(token);
        if (!revoked.ok) {
          sendError(res, revoked.error);
          return;
        }
      }

      res.clearCookie(CLOSER_SESSION_COOKIE, clearCookieOptions(deps));
      sendOk(res, null);
    }),
  );

  router.get(
    API_ROUTES.closer.session,
    asyncHandler(async (req: Request, res: Response) => {
      const token = readCloserSessionToken(req);
      if (token === null) {
        sendError(res, new UnauthorizedError());
        return;
      }

      const verified = await deps.sessionStore.verify(token);
      if (!verified.ok) {
        sendError(res, verified.error);
        return;
      }

      sendOk(res, verified.value);
    }),
  );

  return router;
}

export function createCloserAuthRouter(deps: CloserAuthControllerDeps): Router {
  const router = Router();
  router.use(createCloserAuthPublicRouter(deps));
  router.use(createCloserAuthProtectedRouter(deps));
  return router;
}
