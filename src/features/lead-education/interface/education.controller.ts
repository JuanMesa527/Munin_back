/**
 * Controller HTTP de F2.2. Capa: interface.
 *
 * Sin logica de negocio (regla 5): valida, delega en el caso de uso y traduce
 * el `Result` a la envoltura `ApiResponse` del contrato.
 */

import { Router } from 'express';
import type { ProgressEvent } from '@contracts';
import type { ClockPort } from '@shared/application/ports/index.js';
import { sendError, sendOk } from '@shared/infrastructure/http/api-response.js';
import { asyncHandler } from '@shared/infrastructure/http/async-handler.js';
import { readValidatedQuery, validateBody, validateQuery } from '@shared/infrastructure/http/validate.js';
import type { GetOrCreateJourneyUseCase } from '../application/get-or-create-journey.use-case.js';
import type { RecordProgressUseCase } from '../application/record-progress.use-case.js';
import type { JourneyQuery, ProgressRequest } from './education.dto.js';
import { JourneyQuerySchema, ProgressRequestSchema } from './education.dto.js';

export interface EducationControllerDeps {
  readonly getOrCreateJourney: GetOrCreateJourneyUseCase;
  readonly recordProgress: RecordProgressUseCase;
  readonly clock: ClockPort;
}

/** Rutas relativas: el prefijo `/api/leads/education` lo monta `app.ts`. */
export function createEducationRouter(deps: EducationControllerDeps): Router {
  const router = Router();

  router.get(
    '/journey',
    validateQuery(JourneyQuerySchema),
    asyncHandler(async (_req, res) => {
      const { leadId } = readValidatedQuery<JourneyQuery>(res);
      const resultado = await deps.getOrCreateJourney.execute(leadId);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    '/progress',
    validateBody(ProgressRequestSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as ProgressRequest;
      const evento: ProgressEvent = {
        tipo: body.tipo,
        metaId: body.metaId,
        valor: body.valor,
        // El instante lo pone el servidor: una fecha que viene del cliente es
        // un dato no confiable y ademas permitiria reescribir la historia.
        ocurridoEn: deps.clock.now(),
      };

      const resultado = await deps.recordProgress.execute(body.leadId, evento, body.fechaObjetivo);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  return router;
}
