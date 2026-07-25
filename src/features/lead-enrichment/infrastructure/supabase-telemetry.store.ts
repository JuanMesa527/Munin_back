/**
 * Telemetria en Supabase. Capa: infrastructure (adapter de `TelemetryStorePort`).
 *
 * Escribe los intervalos de atencion en `view_events` y el agregado de la sesion
 * en `enrichment_sessions`. Es un sink de analitica: un fallo aqui NO debe tumbar
 * el flujo del usuario (ya guardo sus swipes), asi que devuelve el error como
 * dato y el caso de uso decide (loguea y sigue).
 *
 * MINIMIZACION (Ley 1581): `dispositivo` y `viewport` son senal gruesa, nunca el
 * user-agent crudo ni la IP.
 */

import type { EnrichmentSessionSummary, ViewEvent } from '@contracts';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import { logger } from '../../../shared/infrastructure/logging/logger.js';
import type { AppSupabaseClient } from '../../../shared/infrastructure/persistence/supabase/supabase-client.js';
import type { TelemetryStorePort } from '../application/ports/telemetry.port.js';

export class SupabaseTelemetryStore implements TelemetryStorePort {
  constructor(private readonly client: AppSupabaseClient) {}

  async recordViews(views: readonly ViewEvent[]): Promise<Result<void>> {
    if (views.length === 0) {
      return ok(undefined);
    }

    const filas = views.map((view) => ({
      lead_id: view.leadId,
      proyecto_id: view.proyectoId,
      seccion: view.seccion,
      dwell_ms: view.dwellMs,
      ocurrido_en: view.ocurridoEn,
    }));

    const { error } = await this.client.from('view_events').insert(filas);
    if (error) {
      logger.error({ op: 'telemetry.views', code: error.code }, 'fallo al guardar vistas');
      return err(new DataUnavailableError('No se pudo registrar la telemetria de vistas'));
    }
    return ok(undefined);
  }

  async recordSession(session: EnrichmentSessionSummary): Promise<Result<void>> {
    const fila = {
      lead_id: session.leadId,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      total_tarjetas: session.totalTarjetas,
      decididas: session.decididas,
      likes: session.likes,
      favoritos: session.favoritos,
      passes: session.passes,
      intent_score: session.intentScore,
      tiempo_total_ms: session.tiempoTotalMs,
      dispositivo: null,
      viewport: null,
    };

    const { error } = await this.client.from('enrichment_sessions').insert(fila);
    if (error) {
      logger.error({ op: 'telemetry.session', code: error.code }, 'fallo al guardar sesion');
      return err(new DataUnavailableError('No se pudo registrar la sesion'));
    }
    return ok(undefined);
  }
}
