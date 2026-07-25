/**
 * Puerto de reloj. Capa: application (puerto compartido).
 * Existe para que el dominio y los casos de uso sean deterministas y testeables:
 * nadie llama `new Date()` fuera de `infrastructure/clock`.
 */

import type { IsoDateTime } from '@contracts';

export interface ClockPort {
  /** Instante actual en ISO-8601 UTC, el formato que viaja por el contrato. */
  now(): IsoDateTime;
  /** Epoch en milisegundos. Para TTLs y medir duraciones, no para persistir. */
  nowMs(): number;
}
