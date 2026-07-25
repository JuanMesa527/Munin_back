/**
 * Borde HTTP de F2.1. Capa: interface.
 *
 * El controller solo traduce: valida con zod, llama al caso de uso y mapea el
 * `Result` a HTTP. Cero logica de negocio (regla 5) -- si aparece un `if` que
 * decide algo del dominio aca, va en el caso de uso.
 *
 * Estas rutas son PUBLICAS: el usuario final de F2.1 no tiene login (el reto
 * exige que sea autogestionado). La proteccion es que `leadId` es un id opaco y
 * que los gates de consentimiento y carril se imponen en el caso de uso.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { API_ROUTES } from '@contracts';
import { asyncHandler } from '../../../shared/infrastructure/http/async-handler.js';
import { sendError, sendOk } from '../../../shared/infrastructure/http/api-response.js';
import {
  readValidatedQuery,
  validateBody,
  validateQuery,
} from '../../../shared/infrastructure/http/validate.js';
import type { BuildDeckUseCase } from '../application/build-deck.use-case.js';
import type { CloseEnrichmentUseCase } from '../application/close-enrichment.use-case.js';
import type { RecordSwipeUseCase } from '../application/record-swipe.use-case.js';
import type { RecordTelemetryUseCase } from '../application/record-telemetry.use-case.js';
import type { DeckQuery, SummaryBody, SwipeBody, TelemetryBody } from './lead-enrichment.dto.js';
import {
  DeckQuerySchema,
  SummaryBodySchema,
  SwipeBodySchema,
  TelemetryBodySchema,
} from './lead-enrichment.dto.js';

export interface LeadEnrichmentControllerDeps {
  readonly buildDeck: BuildDeckUseCase;
  readonly recordSwipe: RecordSwipeUseCase;
  readonly closeEnrichment: CloseEnrichmentUseCase;
  readonly recordTelemetry: RecordTelemetryUseCase;
}

/**
 * Las rutas se montan en la raiz del router y el prefijo lo pone `app.ts`, asi
 * que aqui se usa la ruta completa de `API_ROUTES` (fuente de verdad unica: el
 * backend tampoco inventa URLs).
 */
export function createLeadEnrichmentRouter(deps: LeadEnrichmentControllerDeps): Router {
  const router = Router();

  router.get(
    API_ROUTES.enrichment.deck,
    validateQuery(DeckQuerySchema),
    asyncHandler(async (_req: Request, res: Response) => {
      const query = readValidatedQuery<DeckQuery>(res);
      const resultado = await deps.buildDeck.execute({
        leadId: query.leadId,
        limite: query.limite,
      });

      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    API_ROUTES.enrichment.swipe,
    validateBody(SwipeBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as SwipeBody;
      const resultado = await deps.recordSwipe.execute(body);

      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    API_ROUTES.enrichment.summary,
    validateBody(SummaryBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as SummaryBody;
      const resultado = await deps.closeEnrichment.execute(body);

      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    API_ROUTES.enrichment.telemetry,
    validateBody(TelemetryBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as TelemetryBody;
      const resultado = await deps.recordTelemetry.execute(body);

      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  return router;
}
