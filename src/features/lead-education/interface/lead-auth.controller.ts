/**
 * Controller HTTP del login por OTP del lead (F2.2, adenda A14). Capa: interface.
 *
 * El envio del codigo es MOCK a proposito (mismo criterio que
 * `scheduleFollowUp` en `content.ts`): un SMS/correo real exige consentimiento
 * para esa finalidad especifica y queda fuera de alcance del reto. Fuera de
 * produccion el codigo viaja en la respuesta para poder probar el flujo sin
 * bandeja de entrada real.
 */

import { Router } from 'express';
import type { CookieOptions, Request, Response } from 'express';
import { API_ROUTES } from '@contracts';
import type {
  LeadContactInput,
  LeadContactLookupPort,
} from '@shared/application/ports/lead-contact-lookup.port.js';
import type { LeadOtpPort, LeadSessionStorePort } from '@shared/application/ports/lead-auth.port.js';
import { sendError, sendOk } from '@shared/infrastructure/http/api-response.js';
import { asyncHandler } from '@shared/infrastructure/http/async-handler.js';
import { validateBody } from '@shared/infrastructure/http/validate.js';
import { logger } from '@shared/infrastructure/logging/logger.js';
import { UnauthorizedError } from '@shared/kernel/errors.js';
import type { RequestOtpBody, VerifyOtpBody } from './lead-auth.dto.js';
import { RequestOtpBodySchema, VerifyOtpBodySchema } from './lead-auth.dto.js';
import { LEAD_SESSION_COOKIE, readLeadSessionToken } from './require-lead.js';

export interface LeadAuthControllerDeps {
  readonly contactLookup: LeadContactLookupPort;
  readonly otp: LeadOtpPort;
  readonly sessionStore: LeadSessionStorePort;
  readonly secureCookie: boolean;
  readonly sessionTtlMinutes: number;
  /** Fuera de produccion, el codigo viaja en la respuesta (demo sin SMS real). */
  readonly isProduction: boolean;
}

function cookieOptions(deps: LeadAuthControllerDeps): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: deps.secureCookie,
    path: '/',
    maxAge: deps.sessionTtlMinutes * 60 * 1000,
  };
}

function clearCookieOptions(deps: LeadAuthControllerDeps): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: deps.secureCookie,
    path: '/',
  };
}

/** Error unico para "contacto inexistente", "codigo incorrecto" y "vencido": distinguirlos permite enumerar contactos registrados (OWASP A07). */
function codigoInvalido(): UnauthorizedError {
  return new UnauthorizedError('Codigo invalido o vencido');
}

function contactOf(body: RequestOtpBody | VerifyOtpBody): LeadContactInput {
  return { telefono: body.telefono, email: body.email };
}

export function createLeadAuthRouter(deps: LeadAuthControllerDeps): Router {
  const router = Router();

  router.post(
    API_ROUTES.education.auth.requestOtp,
    validateBody(RequestOtpBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as RequestOtpBody;
      const resuelto = await deps.contactLookup.findLeadIdByContact(contactOf(body));

      // Misma respuesta exista o no el contacto: de lo contrario este endpoint
      // se vuelve un oraculo de "que telefonos/emails estan registrados"
      // (OWASP A07). Solo si el contacto matchea se genera y "envia" un OTP.
      if (resuelto.ok) {
        const emitido = await deps.otp.requestOtp(resuelto.value);
        if (emitido.ok) {
          // Envio MOCK: el canal real (SMS/correo) exige consentimiento
          // especifico y esta fuera de alcance del reto (ver `content.ts`).
          logger.info(
            { leadId: resuelto.value, canal: 'mock' },
            'OTP generado (envio simulado)',
          );
        }
        sendOk(res, {
          enviado: true,
          ...(deps.isProduction || !emitido.ok ? {} : { codigo: emitido.value.codigo }),
        });
        return;
      }

      sendOk(res, { enviado: true });
    }),
  );

  router.post(
    API_ROUTES.education.auth.verifyOtp,
    validateBody(VerifyOtpBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as VerifyOtpBody;
      const resuelto = await deps.contactLookup.findLeadIdByContact(contactOf(body));
      if (!resuelto.ok) {
        sendError(res, codigoInvalido());
        return;
      }

      const verificado = await deps.otp.verifyOtp(resuelto.value, body.codigo);
      if (!verificado.ok) {
        sendError(res, codigoInvalido());
        return;
      }

      const issued = await deps.sessionStore.issue(resuelto.value);
      if (!issued.ok) {
        sendError(res, issued.error);
        return;
      }

      res.cookie(LEAD_SESSION_COOKIE, issued.value.token, cookieOptions(deps));
      sendOk(res, { leadId: resuelto.value });
    }),
  );

  router.post(
    API_ROUTES.education.auth.logout,
    asyncHandler(async (req: Request, res: Response) => {
      const token = readLeadSessionToken(req);
      if (token !== null) {
        const revoked = await deps.sessionStore.revoke(token);
        if (!revoked.ok) {
          sendError(res, revoked.error);
          return;
        }
      }

      res.clearCookie(LEAD_SESSION_COOKIE, clearCookieOptions(deps));
      sendOk(res, null);
    }),
  );

  router.get(
    API_ROUTES.education.auth.session,
    asyncHandler(async (req: Request, res: Response) => {
      const token = readLeadSessionToken(req);
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
