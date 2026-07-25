/**
 * Swipes en memoria. Capa: infrastructure (adapter de `SwipeStorePort`).
 *
 * Driver por defecto de la demo, igual que el resto de la persistencia: F2.1
 * corre sin base de datos. Los metodos no son `async` porque no hay I/O; la
 * firma del puerto si lo es para que el adapter real entre sin tocar los casos
 * de uso.
 */

import type { SwipeEvent } from '@contracts';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import type { SwipeMatchContext, SwipeStorePort } from '../application/ports/swipe-store.port.js';

export class InMemorySwipeStore implements SwipeStorePort {
  private readonly porLead = new Map<string, SwipeEvent[]>();

  // `_contexto` se ignora: el driver de memoria no persiste el glass-box del
  // match (solo lo hace el de Supabase). La firma lo acepta para no divergir.
  record(evento: SwipeEvent, _contexto?: SwipeMatchContext): Promise<Result<SwipeEvent[]>> {
    const actuales = this.porLead.get(evento.leadId) ?? [];
    // Reemplazo en sitio si ya habia decision sobre ese proyecto, para que el
    // usuario pueda devolverse sin duplicar la senal.
    const sinEseProyecto = actuales.filter((previo) => previo.proyectoId !== evento.proyectoId);
    const siguientes = [...sinEseProyecto, { ...evento }];
    this.porLead.set(evento.leadId, siguientes);
    return Promise.resolve(ok(siguientes.map((swipe) => ({ ...swipe }))));
  }

  listByLead(leadId: string): Promise<Result<SwipeEvent[]>> {
    const actuales = this.porLead.get(leadId) ?? [];
    return Promise.resolve(ok(actuales.map((swipe) => ({ ...swipe }))));
  }
}
