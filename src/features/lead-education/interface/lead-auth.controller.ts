/**
 * Controller HTTP del login por OTP del lead (F2.2, adenda A14). Capa: interface.
 *
 * El envio del codigo pasa por `LeadOtpDeliveryPort`: real por correo SMTP
 * cuando `EMAIL_PROVIDER=smtp`, o mock (solo log, sin red) por defecto para
 * desarrollo sin credenciales — ver `email.factory.ts`. El controller no sabe
 * cual de los dos esta activo. Fuera de produccion el codigo ADEMAS viaja en
 * la respuesta para poder probar el flujo sin bandeja de entrada real.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { API_ROUTES } from '@contracts';
import type {
  LeadContactInput,
  LeadContactLookupPort,
} from '@shared/application/ports/lead-contact-lookup.port.js';
import type { LeadOtpPort, LeadSessionStorePort } from '@shared/application/ports/lead-auth.port.js';
import type { LeadOtpDeliveryPort } from '@shared/application/ports/lead-otp-delivery.port.js';
import { sendError, sendOk } from '@shared/infrastructure/http/api-response.js';
import { asyncHandler } from '@shared/infrastructure/http/async-handler.js';
import {
  LEAD_SESSION_COOKIE,
  leadSessionClearCookieOptions,
  leadSessionCookieOptions,
} from '@shared/infrastructure/http/lead-session-cookie.js';
import { validateBody } from '@shared/infrastructure/http/validate.js';
import { logger } from '@shared/infrastructure/logging/logger.js';
import { UnauthorizedError } from '@shared/kernel/errors.js';
import type { RequestOtpBody, VerifyOtpBody } from './lead-auth.dto.js';
import { RequestOtpBodySchema, VerifyOtpBodySchema } from './lead-auth.dto.js';
import { readLeadSessionToken } from './require-lead.js';

export interface LeadAuthControllerDeps {
  readonly contactLookup: LeadContactLookupPort;
  readonly otp: LeadOtpPort;
  readonly otpDelivery: LeadOtpDeliveryPort;
  readonly sessionStore: LeadSessionStorePort;
  readonly secureCookie: boolean;
  readonly sessionTtlMinutes: number;
  /** Fuera de produccion, el codigo viaja en la respuesta (demo sin SMS real). */
  readonly isProduction: boolean;
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
          // Best-effort: el codigo YA se genero y es valido aunque el envio
          // falle, asi que un fallo de correo/SMTP NUNCA tumba esta respuesta
          // (mismo criterio que `emitirSesionSiNoViableMejorEsfuerzo` en
          // `intake.controller.ts`) — solo se loguea para poder investigarlo.
          try {
            const enviado = await deps.otpDelivery.send({
              email: body.email,
              telefono: body.telefono,
              codigo: emitido.value.codigo,
            });
            if (!enviado.ok) {
              logger.error(
                { leadId: resuelto.value, err: enviado.error },
                'fallo el envio del OTP; el codigo sigue siendo valido',
              );
            }
          } catch (causa) {
            logger.error(
              { leadId: resuelto.value, err: causa },
              'fallo inesperado enviando el OTP; el codigo sigue siendo valido',
            );
          }
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

      res.cookie(LEAD_SESSION_COOKIE, issued.value.token, leadSessionCookieOptions(deps));
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

      res.clearCookie(LEAD_SESSION_COOKIE, leadSessionClearCookieOptions(deps));
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
