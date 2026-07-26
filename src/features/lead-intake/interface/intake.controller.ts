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
import { sendError, sendOk } from '@shared/infrastructure/http/api-response.js';
import { asyncHandler } from '@shared/infrastructure/http/async-handler.js';
import { publicRateLimiter } from '@shared/infrastructure/http/security.js';
import { validateBody } from '@shared/infrastructure/http/validate.js';
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
      // F1 NO emite sesion, ni siquiera para `no_viable`: terminar el chat ya
      // no da acceso al modulo educativo. La unica puerta es el OTP contra el
      // correo que el propio lead declaro (`lead-auth.controller.ts`) — antes
      // aca se emitia la cookie "por comodidad" y eso volvia el gate saltable
      // con solo recargar la pagina.
      sendOk(res, resultado.value);
    }),
  );

  return router;
}
