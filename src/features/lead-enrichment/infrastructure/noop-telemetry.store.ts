/**
 * Telemetria no-op. Capa: infrastructure (adapter de `TelemetryStorePort`).
 *
 * Driver por defecto (`PERSISTENCE_DRIVER=memory`): la demo corre sin base de
 * datos, asi que la telemetria simplemente se descarta. No es `async` porque no
 * hay I/O; la firma del puerto si lo es para que el adapter de Supabase entre
 * sin tocar el caso de uso.
 */

import type { EnrichmentSessionSummary, ViewEvent } from '@contracts';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import type { TelemetryStorePort } from '../application/ports/telemetry.port.js';

export class NoopTelemetryStore implements TelemetryStorePort {
  recordViews(_views: readonly ViewEvent[]): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  recordSession(_session: EnrichmentSessionSummary): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }
}
