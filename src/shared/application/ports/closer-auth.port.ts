/**
 * Puertos de autenticacion y sesion del closer (F3/F4).
 * Capa: application (puerto compartido).
 *
 * El token de sesion NO viaja en el DTO `CloserSession`: sale en una cookie
 * httpOnly + SameSite=Strict que el JavaScript del navegador no puede leer
 * (OWASP A07: un XSS no debe poder robar la sesion del closer).
 */

import type { CloserSession } from '@contracts';
import type { Result } from '../../kernel/result.js';

export interface CloserAuthPort {
  /**
   * Verifica credenciales. Devuelve el MISMO error para usuario inexistente y
   * para contrasena incorrecta: distinguirlos permite enumerar usuarios.
   */
  verifyCredentials(input: { usuario: string; contrasena: string }): Promise<Result<CloserSession>>;
}

export interface SessionStorePort {
  /** Emite un token opaco para una sesion ya autenticada. */
  issue(session: CloserSession): Promise<Result<{ token: string }>>;
  /** Valida el token y su vigencia. Es la unica fuente de verdad de la sesion. */
  verify(token: string): Promise<Result<CloserSession>>;
  /** Logout explicito. Idempotente: revocar dos veces no es un error. */
  revoke(token: string): Promise<Result<void>>;
}
