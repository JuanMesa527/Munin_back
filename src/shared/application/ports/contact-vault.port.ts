/**
 * Puerto de la boveda de contacto. Capa: application (puerto compartido).
 *
 * MINIMIZACION DE DATOS (Ley 1581 de 2012, art. 4): el telefono real del lead
 * nunca viaja en un DTO ni sale en un log. Lo que circula es
 * `ContactIdentity` (nombre de pila + telefono enmascarado + token opaco), y el
 * dato real solo se resuelve en el instante de marcar.
 */

import type { ContactIdentity } from '@contracts';
import type { Result } from '../../kernel/result.js';

export interface ContactVaultPort {
  /** Guarda el dato real y devuelve la identidad minima que si puede circular. */
  store(input: { nombre: string; telefono: string }): Promise<Result<ContactIdentity>>;

  /**
   * Resuelve el telefono real para una llamada concreta.
   *
   * Exige rol closer (`closerId` de una sesion verificada, nunca uno que venga
   * en el body del cliente) y SIEMPRE escribe en `AuditLogPort`, tanto si
   * permite como si deniega. Sin ese registro no hay como demostrar quien
   * accedio al dato personal, que es exactamente lo que pide la ley.
   */
  revealForCall(tokenId: string, closerId: string): Promise<Result<{ telefono: string }>>;
}
