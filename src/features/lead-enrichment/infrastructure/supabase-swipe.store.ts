/**
 * Swipes en Supabase. Capa: infrastructure (adapter de `SwipeStorePort`).
 *
 * Persiste cada decision en `swipe_events` con la MISMA semantica que el driver
 * de memoria: idempotente por (lead, proyecto) via upsert, asi devolverse y
 * recidir reemplaza en vez de duplicar. Ademas guarda la telemetria de la
 * tarjeta (dwell, si abrio el detalle) y el glass-box del match congelado.
 *
 * La fila que vuelve de la base es ENTRADA NO CONFIABLE: se valida con zod
 * antes de mapearla al contrato, igual que se hace con el borde HTTP.
 */

import { z } from 'zod';
import type { SwipeEvent } from '@contracts';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import { logger } from '../../../shared/infrastructure/logging/logger.js';
import type { AppSupabaseClient } from '../../../shared/infrastructure/persistence/supabase/supabase-client.js';
import type { SwipeMatchContext, SwipeStorePort } from '../application/ports/swipe-store.port.js';

const TABLA = 'swipe_events';

/** Solo las columnas que se re-hidratan a `SwipeEvent`; el resto es analitica. */
const FilaSchema = z.object({
  lead_id: z.string(),
  proyecto_id: z.string(),
  accion: z.enum(['pass', 'like', 'favorito']),
  decidido_en: z.string(),
  dwell_ms: z.number().nullish(),
  abrio_detalle: z.boolean().nullish(),
  detalle_ms: z.number().nullish(),
});

function aEvento(fila: z.infer<typeof FilaSchema>): SwipeEvent {
  return {
    leadId: fila.lead_id,
    proyectoId: fila.proyecto_id,
    accion: fila.accion,
    decididoEn: fila.decidido_en,
    dwellMs: fila.dwell_ms ?? null,
    abrioDetalle: fila.abrio_detalle ?? false,
    detalleMs: fila.detalle_ms ?? null,
  };
}

export class SupabaseSwipeStore implements SwipeStorePort {
  constructor(private readonly client: AppSupabaseClient) {}

  async record(evento: SwipeEvent, contexto?: SwipeMatchContext): Promise<Result<SwipeEvent[]>> {
    const fila = {
      lead_id: evento.leadId,
      proyecto_id: evento.proyectoId,
      accion: evento.accion,
      decidido_en: evento.decididoEn,
      dwell_ms: evento.dwellMs,
      abrio_detalle: evento.abrioDetalle,
      detalle_ms: evento.detalleMs,
      similitud: contexto?.similitud ?? null,
      razon: contexto?.razon ?? null,
      cabe_en_capacidad: contexto?.cabeEnCapacidad ?? null,
      factores: contexto?.factores ?? null,
    };

    const { error } = await this.client
      .from(TABLA)
      .upsert(fila, { onConflict: 'lead_id,proyecto_id' });
    if (error) {
      logger.error({ op: 'swipe.record', code: error.code }, 'fallo al guardar swipe');
      return err(new DataUnavailableError('No se pudo registrar la decision'));
    }

    return this.listByLead(evento.leadId);
  }

  async listByLead(leadId: string): Promise<Result<SwipeEvent[]>> {
    const { data, error } = await this.client
      .from(TABLA)
      .select('lead_id, proyecto_id, accion, decidido_en, dwell_ms, abrio_detalle, detalle_ms')
      .eq('lead_id', leadId)
      .order('decidido_en', { ascending: true });

    if (error) {
      logger.error({ op: 'swipe.list', code: error.code }, 'fallo al leer swipes');
      return err(new DataUnavailableError('No se pudieron leer las decisiones'));
    }

    const filas = FilaSchema.array().safeParse(data);
    if (!filas.success) {
      logger.error({ op: 'swipe.list' }, 'fila de swipe con forma inesperada');
      return err(new DataUnavailableError('Datos de decisiones con formato invalido'));
    }

    return ok(filas.data.map(aEvento));
  }
}
