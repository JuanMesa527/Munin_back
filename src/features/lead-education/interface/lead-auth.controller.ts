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
import { InfrastructureError, UnauthorizedError } from '@shared/kernel/errors.js';
import type { DomainError } from '@shared/kernel/errors.js';
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
  /**
   * Si al pedir el codigo se responde la causa real en vez de `enviado: true`
   * a ciegas. Es una bandera propia y NO `!isProduction` porque el despliegue
   * de la demo corre con `NODE_ENV=production` y ahi tambien se quiere el
   * aviso. Ver `OTP_REVEAL_CAUSE` en `env.ts` para el costo de encenderlo.
   */
  readonly revealOtpCause: boolean;
}

/** Error unico para "contacto inexistente", "codigo incorrecto" y "vencido": distinguirlos permite enumerar contactos registrados (OWASP A07). */
function codigoInvalido(): UnauthorizedError {
  return new UnauthorizedError('Codigo invalido o vencido');
}

function contactOf(body: RequestOtpBody | VerifyOtpBody): LeadContactInput {
  return { telefono: body.telefono, email: body.email };
}

/**
 * Un solo lugar resuelve el `leadId`, venga por el canal que venga: el gate
 * manda `leadId` (ya lo tiene de F1) y la recuperacion manda telefono/email.
 * El zod del DTO ya garantizo que llega exactamente uno.
 */
async function resolverLeadId(
  deps: LeadAuthControllerDeps,
  body: RequestOtpBody | VerifyOtpBody,
): Promise<{ ok: true; value: string } | { ok: false; error: DomainError }> {
  if (body.leadId !== null) {
    // No basta con confiar en el id: si no existe, no hay a quien mandarle
    // nada. `findContactByLeadId` en `requestOtp` ya lo comprueba; aca solo
    // se propaga el id para que `verifyOtp` no tenga que repetir el viaje.
    return { ok: true, value: body.leadId };
  }
  const resuelto = await deps.contactLookup.findLeadIdByContact(contactOf(body));
  // El error se PROPAGA (antes se descartaba): `requestOtp` lo necesita para
  // poder distinguir "no hay cuenta con ese correo" de "se cayo Supabase"
  // fuera de produccion. Quien no deba revelarlo simplemente no lo mira.
  return resuelto.ok ? { ok: true, value: resuelto.value } : { ok: false, error: resuelto.error };
}

/**
 * `nicolas@gmail.com` -> `ni****@gmail.com`. La pantalla del gate tiene que
 * poder decir A DONDE fue el codigo (si no, el lead no sabe que bandeja
 * abrir) sin escupir el correo completo a quien solo tenga el `leadId`.
 */
function enmascararEmail(email: string): string {
  const arroba = email.indexOf('@');
  if (arroba <= 0) return '****';
  const usuario = email.slice(0, arroba);
  const dominio = email.slice(arroba);
  const visible = usuario.slice(0, Math.min(2, usuario.length));
  return `${visible}${'*'.repeat(Math.max(usuario.length - visible.length, 1))}${dominio}`;
}

export function createLeadAuthRouter(deps: LeadAuthControllerDeps): Router {
  const router = Router();

  router.post(
    API_ROUTES.education.auth.requestOtp,
    validateBody(RequestOtpBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as RequestOtpBody;
      const esGate = body.leadId !== null;
      const resuelto = await resolverLeadId(deps, body);

      // Con la bandera puesta el endpoint DICE la verdad (no existe la cuenta /
      // fallo el envio) en vez de responder "enviado" a ciegas: el "enviado:
      // true" mudo hacia indistinguibles un SMTP caido, un correo sin cuenta y
      // un envio correcto — tres causas con arreglos opuestos. Apagarla vuelve
      // a la respuesta ciega (OWASP A07, ver nota de abajo).
      const revelarCausa = deps.revealOtpCause;

      // Misma respuesta exista o no el contacto: de lo contrario este endpoint
      // se vuelve un oraculo de "que telefonos/emails estan registrados"
      // (OWASP A07). Solo si el contacto matchea se genera y "envia" un OTP.
      if (!resuelto.ok) {
        if (revelarCausa) {
          sendError(res, resuelto.error);
          return;
        }
        sendOk(res, { enviado: true });
        return;
      }
      const leadId = resuelto.value;

      // El contacto GUARDADO manda sobre el que vino en el body: es el que F1
      // capturo y el unico que existe cuando el canal es `leadId` (el gate no
      // le pide al lead un correo que ya dio en el chat). De paso arregla el
      // caso "entro por telefono": el codigo igual sale por su correo real.
      const contacto = await deps.contactLookup.findContactByLeadId(leadId);
      if (!contacto.ok) {
        // Por `leadId` SI se puede responder con el error real: un uuid no es
        // enumerable y quien lo manda ya lo tenia. Por telefono/email se sigue
        // respondiendo "enviado" a ciegas (misma regla de arriba).
        if (esGate || revelarCausa) {
          sendError(res, contacto.error);
          return;
        }
        sendOk(res, { enviado: true });
        return;
      }
      const destinoEmail = contacto.value.email ?? body.email;
      const destinoTelefono = contacto.value.telefono ?? body.telefono;

      const emitido = await deps.otp.requestOtp(leadId);
      /** Se llena solo si el canal real fallo; fuera de produccion se responde. */
      let falloEnvio: DomainError | null = null;
      if (emitido.ok) {
        // Best-effort: el codigo YA se genero y es valido aunque el envio
        // falle, asi que un fallo de correo/SMTP NUNCA tumba esta respuesta
        // (mismo criterio que `emitirSesionSiNoViableMejorEsfuerzo` en
        // `intake.controller.ts`) — solo se loguea para poder investigarlo.
        try {
          const enviado = await deps.otpDelivery.send({
            email: destinoEmail,
            telefono: destinoTelefono,
            codigo: emitido.value.codigo,
          });
          if (!enviado.ok) {
            falloEnvio = enviado.error;
            logger.error(
              { leadId, err: enviado.error },
              'fallo el envio del OTP; el codigo sigue siendo valido',
            );
          }
        } catch (causa) {
          falloEnvio = new InfrastructureError('No se pudo enviar el codigo de acceso');
          logger.error(
            { leadId, err: causa },
            'fallo inesperado enviando el OTP; el codigo sigue siendo valido',
          );
        }
      }

      // El codigo es valido igual (se emitio antes del envio), pero callar el
      // fallo del canal es lo que hacia parecer "roto el SMTP" cuando el
      // problema estaba en otro lado. En produccion se sigue callando.
      if (falloEnvio !== null && revelarCausa) {
        sendError(res, falloEnvio);
        return;
      }

      sendOk(res, {
        enviado: true,
        // Solo en el gate: ahi el lead NO escribio nada y necesita saber que
        // bandeja abrir. En el flujo por telefono/email devolverlo delataria
        // si el contacto existe — justo lo que evita el `sendOk` a ciegas.
        ...(esGate
          ? {
              destino: destinoEmail !== null ? enmascararEmail(destinoEmail) : null,
              canal: destinoEmail !== null ? ('email' as const) : ('telefono' as const),
            }
          : {}),
        ...(deps.isProduction || !emitido.ok ? {} : { codigo: emitido.value.codigo }),
      });
    }),
  );

  router.post(
    API_ROUTES.education.auth.verifyOtp,
    validateBody(VerifyOtpBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as VerifyOtpBody;
      const resuelto = await resolverLeadId(deps, body);
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
