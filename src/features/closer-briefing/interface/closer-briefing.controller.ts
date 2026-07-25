import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { API_ROUTES } from '@contracts';
import type { CloserSession } from '@contracts';
import type { BuildBriefingUseCase } from '../application/build-briefing.use-case.js';
import type { RevealContactUseCase } from '../application/reveal-contact.use-case.js';
import { asyncHandler } from '../../../shared/infrastructure/http/async-handler.js';
import { sendError, sendOk } from '../../../shared/infrastructure/http/api-response.js';
import { validateBody } from '../../../shared/infrastructure/http/validate.js';
import { ValidationError } from '../../../shared/kernel/errors.js';

const LeadIdSchema = z.string().trim().min(1).max(128);
const RevealContactBodySchema = z.object({ leadId: LeadIdSchema });

type RevealContactBody = z.infer<typeof RevealContactBodySchema>;

export interface CloserBriefingControllerDeps {
  readonly buildBriefing: BuildBriefingUseCase;
  readonly revealContact: RevealContactUseCase;
}

export function createCloserBriefingRouter(deps: CloserBriefingControllerDeps): Router {
  const router = Router();

  router.get(
    `${API_ROUTES.closer.briefing}/:leadId`,
    asyncHandler(async (req: Request, res: Response) => {
      const parsedLeadId = LeadIdSchema.safeParse(req.params.leadId);
      if (!parsedLeadId.success) {
        sendError(
          res,
          new ValidationError('Parametros de ruta no validos', {
            leadId: 'leadId debe tener entre 1 y 128 caracteres',
          }),
        );
        return;
      }

      const result = await deps.buildBriefing.execute(parsedLeadId.data);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      sendOk(res, result.value);
    }),
  );

  router.post(
    API_ROUTES.closer.revealContact,
    validateBody(RevealContactBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as RevealContactBody;
      const closer = res.locals.closer as CloserSession;
      const result = await deps.revealContact.execute({
        leadId: body.leadId,
        closerId: closer.closerId,
      });
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      sendOk(res, result.value);
    }),
  );

  return router;
}
