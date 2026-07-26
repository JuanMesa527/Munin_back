/**
 * Cookie de sesion del lead (F2.2, adenda A14). Capa: infrastructure.
 *
 * Nombre y opciones de la cookie `lead_session`, compartidos entre TODOS los
 * controllers que la emiten o la leen. Vive en `shared/` — no en
 * `lead-education`, donde nacio — porque F1 (lead-intake) tambien necesita
 * emitirla al clasificar `no_viable` (auto-login sin OTP: el usuario ya
 * "demostro" su identidad completando la conversacion), y una feature no
 * puede importar de la capa `interface` de otra sin romper el aislamiento
 * entre features (spec lead-intake-interface "Feature Isolation via Module
 * Boundary").
 */

import type { CookieOptions } from 'express';

export const LEAD_SESSION_COOKIE = 'lead_session';

export interface LeadSessionCookieDeps {
  readonly secureCookie: boolean;
  readonly sessionTtlMinutes: number;
}

export function leadSessionCookieOptions(deps: LeadSessionCookieDeps): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: deps.secureCookie,
    path: '/',
    maxAge: deps.sessionTtlMinutes * 60 * 1000,
  };
}

export function leadSessionClearCookieOptions(deps: {
  readonly secureCookie: boolean;
}): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: deps.secureCookie,
    path: '/',
  };
}
