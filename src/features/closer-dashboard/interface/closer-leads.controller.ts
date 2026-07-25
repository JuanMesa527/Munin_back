import { Router } from 'express';
import type { Request, Response } from 'express';
import type { LeadListFilters } from '@contracts';
import type { ListViableLeadsUseCase } from '../application/list-viable-leads.use-case.js';
import { asyncHandler } from '../../../shared/infrastructure/http/async-handler.js';
import { sendError, sendOk } from '../../../shared/infrastructure/http/api-response.js';
import { readValidatedQuery, validateQuery } from '../../../shared/infrastructure/http/validate.js';
import { API_ROUTES } from '@contracts';
import type { CloserLeadsQuery } from './closer-leads.dto.js';
import { CloserLeadsQuerySchema } from './closer-leads.dto.js';

export interface CloserLeadsControllerDeps {
  readonly listViableLeads: ListViableLeadsUseCase;
}

export function createCloserLeadsRouter(deps: CloserLeadsControllerDeps): Router {
  const router = Router();

  router.get(
    API_ROUTES.closer.leads,
    validateQuery(CloserLeadsQuerySchema),
    asyncHandler(async (_req: Request, res: Response) => {
      const query = readValidatedQuery<CloserLeadsQuery>(res);
      const filters: LeadListFilters = {
        soloAfiliados: query.soloAfiliados,
        soloNutridos: query.soloNutridos,
        segmento: query.segmento,
        ciudad: query.ciudad,
        scoreMinimo: query.scoreMinimo,
        banda: query.banda,
        busqueda: null,
      };
      const result = await deps.listViableLeads.execute({
        filters,
        sort: query.sort,
        pagina: query.pagina,
        porPagina: query.porPagina,
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
