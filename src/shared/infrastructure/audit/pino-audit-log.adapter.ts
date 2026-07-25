/**
 * Log de auditoria sobre pino. Capa: infrastructure (adapter de `AuditLogPort`).
 *
 * Colsubsidio es una entidad Vigilada por la Superintendencia del Subsidio
 * Familiar: cada acceso a un dato personal tiene que quedar trazado (quien, que,
 * sobre que, con que resultado y cuando). Esta traza es intencionalmente
 * ESTRUCTURADA y sin PII: registra el hecho del acceso, no el dato accedido, asi
 * que el log de auditoria no se convierte el mismo en una base de datos personal.
 *
 * En produccion esto va a un almacen append-only e inmutable (no a stdout), pero
 * el puerto que consume el dominio no cambia.
 */

import type { AuditEntry, AuditLogPort } from '../../application/ports/audit-log.port.js';
import { logger } from '../logging/logger.js';

/** Canal propio para poder filtrar auditoria del resto del log operativo. */
const auditLogger = logger.child({ canal: 'auditoria' });

export class PinoAuditLogAdapter implements AuditLogPort {
  record(entry: AuditEntry): Promise<void> {
    // `warn` cuando se deniega: un patron de denegaciones es exactamente la
    // senal que un monitoreo serio deberia alertar (OWASP A09).
    if (entry.resultado === 'denegado') {
      auditLogger.warn({ auditoria: entry }, 'acceso a dato personal denegado');
    } else {
      auditLogger.info({ auditoria: entry }, 'acceso a dato personal permitido');
    }
    return Promise.resolve();
  }
}
