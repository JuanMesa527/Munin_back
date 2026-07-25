/**
 * Reloj del sistema. Capa: infrastructure (adapter de `ClockPort`).
 * El unico lugar del backend donde se llama `Date`: los tests inyectan un reloj
 * fijo y asi las fechas del contrato dejan de ser una fuente de flakiness.
 */

import type { IsoDateTime } from '@contracts';
import type { ClockPort } from '../../application/ports/clock.port.js';

export class SystemClock implements ClockPort {
  /** Siempre UTC: el contrato dice ISO-8601 en UTC, no hora de Bogota. */
  now(): IsoDateTime {
    return new Date().toISOString();
  }

  nowMs(): number {
    return Date.now();
  }
}
