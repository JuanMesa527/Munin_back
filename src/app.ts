/**
 * Composition root del backend. Capa: composicion.
 * ORDEN LOAD-BEARING (ver comentario en `security.ts`): `applySecurity` ->
 * `createHttpLogger()` -> `GET /api/health` -> router de
 * `lead-intake.module.ts` -> `notFoundHandler` -> `errorHandler`. Moverlo
 * deja rutas sin cabeceras/limites o respuestas de error sin envoltura.
 *
 * Fase 2 (spec app-bootstrap-back): SOLO monta `lead-intake.module.ts`.
 * Nada de F2-F4 todavia — "No F2-F4 wiring present".
 */

import express from 'express';
import type { Express, Request, Response } from 'express';
import { API_ROUTES } from '@contracts';
import { sendOk } from '@shared/infrastructure/http/api-response.js';
import type { AppEnv } from '@shared/infrastructure/config/env.js';
import { errorHandler, notFoundHandler } from '@shared/infrastructure/http/error-handler.js';
import { applySecurity } from '@shared/infrastructure/http/security.js';
import { createHttpLogger } from '@shared/infrastructure/logging/logger.js';
import { createLeadIntakeModule } from './features/lead-intake/lead-intake.module.js';

export function createApp(env: AppEnv): Express {
  const app = express();

  applySecurity(app, env);
  app.use(createHttpLogger());

  app.get(API_ROUTES.health, (_req: Request, res: Response): void => {
    sendOk(res, { status: 'ok' });
  });

  const { router } = createLeadIntakeModule(env);
  app.use(router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
