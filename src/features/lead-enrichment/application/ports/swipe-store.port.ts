/**
 * Puerto de persistencia de swipes. Capa: application (puerto LOCAL de F2.1).
 *
 * Vive dentro de la feature y no en `shared/application/ports` porque ninguna
 * otra feature necesita el detalle gesto-a-gesto: F3 y F4 consumen el resultado
 * agregado (`EnrichedLead.intereses`, `intentScore`) a traves de
 * `LeadRepository`. Un puerto compartido que solo usa un consumidor es
 * acoplamiento sin beneficio.
 */

import type { Factor, SwipeEvent } from '@contracts';
import type { Result } from '../../../../shared/kernel/result.js';

/**
 * Por que se le mostro ESE proyecto a ESE lead, congelado al momento de decidir.
 * Es opcional en `record` porque el driver in-memory no lo necesita; el adapter
 * de Supabase lo persiste para que el analisis vea el glass-box tal como estaba
 * cuando el usuario eligio, aunque el catalogo cambie despues.
 */
export interface SwipeMatchContext {
  similitud: number;
  razon: string;
  cabeEnCapacidad: boolean;
  factores: Factor[];
}

export interface SwipeStorePort {
  /**
   * Registra la decision. Idempotente por (lead, proyecto): volver a decidir
   * sobre la misma tarjeta REEMPLAZA la decision anterior, porque el usuario
   * puede devolverse y cambiar de opinion.
   */
  record(evento: SwipeEvent, contexto?: SwipeMatchContext): Promise<Result<SwipeEvent[]>>;
  /** Swipes del lead, en el orden en que se decidieron. */
  listByLead(leadId: string): Promise<Result<SwipeEvent[]>>;
}
