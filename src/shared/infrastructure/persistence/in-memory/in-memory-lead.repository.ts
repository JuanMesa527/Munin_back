/**
 * Repositorio de leads en memoria. Capa: infrastructure (adapter de `LeadRepository`).
 * Es el driver por defecto del scaffolding (`PERSISTENCE_DRIVER=memory`): la demo
 * corre sin base de datos y sin tocar NINGUN sistema de Colsubsidio.
 *
 * Los metodos no son `async` a proposito: no hay I/O que esperar. La firma del
 * puerto si es asincrona para que el adapter real (Postgres) entre sin cambiar
 * ni una linea de los casos de uso.
 *
 * Convencion de scaffolding: un parametro con prefijo `_` significa "el cuerpo
 * todavia es un stub"; quita el `_` al implementar.
 */

import type {
  EnrichedLead,
  LeadListFilters,
  LeadListPage,
  LeadListSort,
  LeadProfile,
} from '@contracts';
import { rankAndPageViableLeads } from '../../../../features/closer-dashboard/domain/lead-ranking.js';
import type { LeadRepository } from '../../../application/ports/lead-repository.port.js';
import { NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';

export class InMemoryLeadRepository implements LeadRepository {
  private readonly perfiles = new Map<string, LeadProfile>();
  private readonly enriquecidos = new Map<string, EnrichedLead>();

  save(profile: LeadProfile): Promise<Result<LeadProfile>> {
    // Copia defensiva en la entrada y en la salida: si compartieramos la
    // referencia, un caso de uso podria mutar el "almacenamiento" por accidente
    // y tendriamos un bug que la base de datos real jamas reproduciria.
    const guardado = structuredClone(profile);
    this.perfiles.set(guardado.id, guardado);
    return Promise.resolve(ok(structuredClone(guardado)));
  }

  findById(id: string): Promise<Result<LeadProfile>> {
    const encontrado = this.perfiles.get(id);
    if (encontrado === undefined) {
      return Promise.resolve(err(new NotFoundError('Lead no encontrado')));
    }
    return Promise.resolve(ok(structuredClone(encontrado)));
  }

  saveEnriched(lead: EnrichedLead): Promise<Result<EnrichedLead>> {
    const guardado = structuredClone(lead);
    this.enriquecidos.set(guardado.id, guardado);
    // El perfil base tambien se refresca: `EnrichedLead` extiende `LeadProfile`,
    // y dejar las dos vistas desincronizadas seria una trampa para F3/F4.
    this.perfiles.set(guardado.id, structuredClone(guardado));
    return Promise.resolve(ok(structuredClone(guardado)));
  }

  findEnrichedById(id: string): Promise<Result<EnrichedLead>> {
    const encontrado = this.enriquecidos.get(id);
    if (encontrado === undefined) {
      return Promise.resolve(err(new NotFoundError('Lead enriquecido no encontrado')));
    }
    return Promise.resolve(ok(structuredClone(encontrado)));
  }

  listViable(
    filters: LeadListFilters,
    sort: LeadListSort,
    pagina: number,
    porPagina: number,
  ): Promise<Result<LeadListPage>> {
    const leads = [...this.enriquecidos.values()].map((lead) => structuredClone(lead));
    const page = rankAndPageViableLeads(leads, filters, sort, pagina, porPagina);
    return Promise.resolve(ok(structuredClone(page)));
  }
}
