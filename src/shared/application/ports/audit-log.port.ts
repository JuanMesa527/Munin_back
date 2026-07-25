/**
 * Puerto de auditoria. Capa: application (puerto compartido).
 *
 * Colsubsidio es una entidad Vigilada por la Superintendencia del Subsidio
 * Familiar: el acceso a datos personales tiene que ser TRAZABLE (quien, que,
 * sobre que recurso, con que resultado y cuando). Este puerto no registra el
 * dato personal en si, solo el hecho del acceso — por eso puede ir a los logs
 * sin violar la Ley 1581.
 *
 * `record` devuelve `Promise<void>` y no `Result`: la auditoria no debe poder
 * tumbar la operacion que la origino, y un fallo de escritura se resuelve en el
 * adapter (log de error), no ramificando el caso de uso.
 */

import type { IsoDateTime } from '@contracts';

export interface AuditEntry {
  /** Quien actuo. Sale de la sesion verificada, nunca del body del cliente. */
  actorId: string;
  /** Verbo estable, p. ej. `revelar_contacto`. Sirve para consultar el log. */
  accion: string;
  recursoId: string;
  resultado: 'permitido' | 'denegado';
  ocurridoEn: IsoDateTime;
}

export interface AuditLogPort {
  record(entry: AuditEntry): Promise<void>;
}
