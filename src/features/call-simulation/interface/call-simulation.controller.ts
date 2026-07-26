/**
 * Borde HTTP de F5. Capa: interface.
 *
 * El controller solo traduce: valida con zod, llama al caso de uso y mapea el
 * `Result` a HTTP. Cero logica de negocio — el veredicto, la cobertura y las
 * alertas de cumplimiento se calculan en `domain/`, nunca aqui.
 *
 * Estas rutas viven detras del guard de rol closer en el front (`CloserGuard`);
 * la autorizacion REAL la impone el backend — hoy comparte el mismo estado
 * sin-auth que el resto de `/api/closer/*` porque F3/F4 aun no tiene backend de
 * sesion (ver `use-closer-session.ts` en el front).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { API_ROUTES } from '@contracts';
import { asyncHandler } from '../../../shared/infrastructure/http/async-handler.js';
import { sendError, sendOk } from '../../../shared/infrastructure/http/api-response.js';
import { validateBody } from '../../../shared/infrastructure/http/validate.js';
import type { EndCallUseCase } from '../application/end-call.use-case.js';
import type { ProcessCallTurnUseCase } from '../application/process-call-turn.use-case.js';
import type { StartCallUseCase } from '../application/start-call.use-case.js';
import type { TranscribeUtteranceUseCase } from '../application/transcribe-utterance.use-case.js';
import type {
  CallTurnBody,
  EndCallBody,
  StartCallBody,
  TranscribeBody,
} from './call-simulation.dto.js';
import {
  CallTurnBodySchema,
  EndCallBodySchema,
  StartCallBodySchema,
  TranscribeBodySchema,
} from './call-simulation.dto.js';

export interface CallSimulationControllerDeps {
  readonly startCall: StartCallUseCase;
  readonly processCallTurn: ProcessCallTurnUseCase;
  readonly endCall: EndCallUseCase;
  readonly transcribeUtterance: TranscribeUtteranceUseCase;
}

/**
 * Las rutas se montan en la raiz del router y el prefijo lo pone `app.ts`, asi
 * que aqui se usa la ruta completa de `API_ROUTES` (fuente de verdad unica).
 */
export function createCallSimulationRouter(deps: CallSimulationControllerDeps): Router {
  const router = Router();

  router.post(
    API_ROUTES.closer.call.start,
    validateBody(StartCallBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as StartCallBody;
      const resultado = await deps.startCall.execute(body);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    API_ROUTES.closer.call.turn,
    validateBody(CallTurnBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as CallTurnBody;
      const resultado = await deps.processCallTurn.execute(body);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  router.post(
    API_ROUTES.closer.call.end,
    validateBody(EndCallBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as EndCallBody;
      const resultado = await deps.endCall.execute(body);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  // Voz del closer -> texto. No toca la sesion de la llamada: el closer revisa
  // y corrige la transcripcion ANTES de enviar el turno.
  router.post(
    API_ROUTES.closer.call.transcribe,
    validateBody(TranscribeBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as TranscribeBody;
      const resultado = await deps.transcribeUtterance.execute(body);
      if (!resultado.ok) {
        sendError(res, resultado.error);
        return;
      }
      sendOk(res, resultado.value);
    }),
  );

  return router;
}
