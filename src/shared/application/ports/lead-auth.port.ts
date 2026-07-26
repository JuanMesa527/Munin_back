/**
 * Puertos de autenticacion y sesion del LEAD (F2.2). Capa: application (puerto
 * compartido).
 *
 * Espeja `closer-auth.port.ts` a proposito: mismo patron de cookie httpOnly +
 * store de sesion opaco. La diferencia es que aqui no hay una "credencial" que
 * verificar de forma estatica (usuario/contrasena) — el OTP mismo ES la
 * credencial, y se genera y consume en el momento, por eso `LeadOtpPort` mezcla
 * generacion y verificacion en un solo puerto con estado.
 */

import type { IsoDateTime, LeadSession } from '@contracts';
import type { Result } from '../../kernel/result.js';

export interface LeadOtpPort {
  /**
   * Genera un OTP de un solo uso para el lead y devuelve el codigo en claro UNA
   * vez, para que el caller lo "envie" (mock) y lo loguee server-side. De aqui
   * en adelante el store solo guarda el hash.
   */
  requestOtp(leadId: string): Promise<Result<{ codigo: string; expiraEn: IsoDateTime }>>;
  /**
   * Verifica el codigo. Mismo error generico para codigo incorrecto, vencido
   * o ya sin intentos: distinguirlos permitiria a un atacante mapear el
   * estado interno del OTP de otro lead (OWASP A07).
   */
  verifyOtp(leadId: string, codigo: string): Promise<Result<void>>;
}

export interface LeadSessionStorePort {
  /** Emite un token opaco para un lead ya verificado por OTP. */
  issue(leadId: string): Promise<Result<{ token: string }>>;
  /** Valida el token y su vigencia. Es la unica fuente de verdad de la sesion. */
  verify(token: string): Promise<Result<LeadSession>>;
  /** Logout explicito. Idempotente: revocar dos veces no es un error. */
  revoke(token: string): Promise<Result<void>>;
}
