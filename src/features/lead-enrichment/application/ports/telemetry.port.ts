/**
 * Puerto de telemetria de atencion de F2.1. Capa: application (puerto LOCAL).
 *
 * Vive dentro de la feature porque nadie mas la consume: es un SINK de analitica
 * (cuanto miro cada parte, si abrio el detalle), separado del store operativo de
 * swipes. Separarlo deja que en modo `memory` sea un no-op sin arrastrar una
 * base de datos, y en modo `supabase` escriba `view_events` y
 * `enrichment_sessions` sin que el caso de uso sepa a donde van.
 */

import type { EnrichmentSessionSummary, ViewEvent } from '@contracts';
import type { Result } from '../../../../shared/kernel/result.js';

export interface TelemetryStorePort {
  /** Intervalos de atencion (cuanto miro cada parte). */
  recordViews(views: readonly ViewEvent[]): Promise<Result<void>>;
  /** Resumen agregado de la sesion (conteos, intencion, tiempo total). */
  recordSession(session: EnrichmentSessionSummary): Promise<Result<void>>;
}
