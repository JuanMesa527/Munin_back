/**
 * Controller Express de F1 (lead-intake). Capa: interface.
 * Unico borde HTTP de la feature: valida con zod (`validate.ts`), aplica el
 * limitador publico (`security.ts`) y traduce `Result` a `ApiResponse`
 * (`api-response.ts`). Nunca loguea el body crudo — el logger HTTP
 * (`createHttpLogger`, montado en `app.ts`) serializa solo metodo/ruta, y
 * este controller tampoco llama al logger directamente (spec "No PII in Logs").
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import { API_ROUTES } from '@contracts';
import type { LeadSessionStorePort } from '@shared/application/ports/lead-auth.port.js';
import { sendError, sendOk } from '@shared/infrastructure/http/api-response.js';
import { asyncHandler } from '@shared/infrastructure/http/async-handler.js';
import {
  LEAD_SESSION_COOKIE,
  leadSessionCookieOptions,
} from '@shared/infrastructure/http/lead-session-cookie.js';
import { publicRateLimiter } from '@shared/infrastructure/http/security.js';
import { validateBody } from '@shared/infrastructure/http/validate.js';
import { logger } from '@shared/infrastructure/logging/logger.js';
import type { ProcessConversationTurnUseCase } from '../application/process-conversation-turn.use-case.js';
import type { StartConversationUseCase } from '../application/start-conversation.use-case.js';
import type { SubmitConsentUseCase } from '../application/submit-consent.use-case.js';
import type { ProcessConversationTurnRequest, SubmitConsentRequest } from './intake.dto.js';
import {
  ProcessConversationTurnRequestSchema,
  StartConversationRequestSchema,
  SubmitConsentRequestSchema,
} from './intake.dto.js';

/**
 * `Pick<Clase, 'execute'>` en vez de la clase concreta: el controller solo
 * necesita el comportamiento (`execute`), no la implementacion — mas facil
 * de testear con un doble de prueba y sin acoplar el borde HTTP a como cada
 * caso de uso construye sus dependencias.
 */
export interface IntakeControllerDeps {
  readonly startConversation: Pick<StartConversationUseCase, 'execute'>;
  readonly submitConsent: Pick<SubmitConsentUseCase, 'execute'>;
  readonly processConversationTurn: Pick<ProcessConversationTurnUseCase, 'execute'>;
  /**
   * Auto-login del lead `no_viable`, sin OTP (ya "demostro" su identidad
   * completando la conversacion en esta misma sesion de navegador). Los 3
   * campos son opcionales EN CONJUNTO para no romper otros consumidores/tests
   * que construyan el router sin este dep: si falta cualquiera de los 3, el
   * turno responde igual mas no emite la cookie (ver `sessionDepsCompletos`).
   */
  readonly sessionStore?: LeadSessionStorePort;
  readonly secureCookie?: boolean;
  readonly sessionTtlMinutes?: number;
}

interface SessionDepsCompletos {
  readonly sessionStore: LeadSessionStorePort;
  readonly secureCookie: boolean;
  readonly sessionTtlMinutes: number;
}

function sessionDepsCompletos(deps: IntakeControllerDeps): SessionDepsCompletos | null {
  if (
    deps.sessionStore === undefined ||
    deps.secureCookie === undefined ||
    deps.sessionTtlMinutes === undefined
  ) {
    return null;
  }
  return {
    sessionStore: deps.sessionStore,
    secureCookie: deps.secureCookie,
    sessionTtlMinutes: deps.sessionTtlMinutes,
  };
}

/**
 * Best-effort: si F1 clasifico el lead como `no_viable`, se le emite la
 * cookie de sesion (mismo mecanismo que el login por OTP de F2.2) para que
 * `ClientFlowPage` lo reconozca solo al recargar y salte directo al camino de
 * nutricion. Un fallo emitiendo la sesion NUNCA tumba la respuesta del turno
 * — mismo criterio que `explicacionMejorEsfuerzo` en el caso de uso: el dato
 * ya se persistio, la sesion es una comodidad adicional, no un requisito.
 */
async function emitirSesionSiNoViableMejorEsfuerzo(
  deps: IntakeControllerDeps,
  resultado: { routing: { carril: string } | null; profile: { id: string } },
  res: Response,
): Promise<void> {
  if (resultado.routing?.carril !== 'no_viable') {
    return;
  }
  const sesion = sessionDepsCompletos(deps);
  if (sesion === null) {
    return;
  }

  try {
    const issued = await sesion.sessionStore.issue(resultado.profile.id);
    if (!issued.ok) {
      logger.error(
        { err: issued.error },
        'no se pudo emitir la sesion automatica del lead no_viable',
      );
      return;
    }
    res.cookie(LEAD_SESSION_COOKIE, issued.value.token, leadSessionCookieOptions(sesion));
  } catch (causa) {
    logger.error(
      { err: causa },
      'fallo inesperado emitiendo la sesion automatica del lead no_viable',
    );
  }
}

/**
 * `createIntakeRouter` — el router monta las rutas completas de
 * `API_ROUTES.intake.*` (design.md D7): quien lo use hace `app.use(router)`
 * en la raiz, nunca un `app.use('/algo', router)` con sufijos reescritos.
 */
export function createIntakeRouter(deps: IntakeControllerDeps): Router {
  const router = Router();

  // OWASP A03/A05: todo el flujo publico de intake comparte un unico limitador.
  router.use(publicRateLimiter);

  router.post(
    API_ROUTES.intake.start,
    validateBody(StartConversationRequestSchema),
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const resultado = await deps.startConversation.execute();
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    API_ROUTES.intake.consent,
    validateBody(SubmitConsentRequestSchema),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const body = req.body as SubmitConsentRequest;
      const resultado = await deps.submitConsent.execute(body);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    API_ROUTES.intake.turn,
    validateBody(ProcessConversationTurnRequestSchema),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const body = req.body as ProcessConversationTurnRequest;
      const resultado = await deps.processConversationTurn.execute(body);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      await emitirSesionSiNoViableMejorEsfuerzo(deps, resultado.value, res);
      sendOk(res, resultado.value);
    }),
  );

  return router;
}
