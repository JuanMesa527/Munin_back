import { Router } from 'express';
import type { RequestHandler } from 'express';
import type {
  CloserAuthPort,
  SessionStorePort,
} from '../../shared/application/ports/closer-auth.port.js';
import type { LeadRepository } from '../../shared/application/ports/lead-repository.port.js';
import { ListViableLeadsUseCase } from './application/list-viable-leads.use-case.js';
import {
  createCloserAuthProtectedRouter,
  createCloserAuthPublicRouter,
} from './interface/closer-auth.controller.js';
import { createCloserLeadsRouter } from './interface/closer-leads.controller.js';
import { createRequireCloser } from './interface/require-closer.js';

export interface CloserDashboardModuleDeps {
  readonly auth: CloserAuthPort;
  readonly sessionStore: SessionStorePort;
  readonly secureCookie: boolean;
  readonly sessionTtlMinutes: number;
  readonly leads: LeadRepository;
}

export interface CloserDashboardModule {
  readonly publicRouter: Router;
  readonly protectedRouter: Router;
  readonly requireCloser: RequestHandler;
}

export function createCloserDashboardModule(
  deps: CloserDashboardModuleDeps,
): CloserDashboardModule {
  const authDeps = {
    auth: deps.auth,
    sessionStore: deps.sessionStore,
    secureCookie: deps.secureCookie,
    sessionTtlMinutes: deps.sessionTtlMinutes,
  };
  const publicRouter = Router();
  publicRouter.use(createCloserAuthPublicRouter(authDeps));

  const protectedRouter = Router();
  protectedRouter.use(createCloserAuthProtectedRouter(authDeps));
  protectedRouter.use(
    createCloserLeadsRouter({
      listViableLeads: new ListViableLeadsUseCase(deps.leads),
    }),
  );

  return {
    publicRouter,
    protectedRouter,
    requireCloser: createRequireCloser(deps.sessionStore),
  };
}
