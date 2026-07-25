/**
 * Puerto de persistencia de leads. Capa: application (puerto compartido).
 * Es la frontera entre la tuberia (F1/F2.1) y el dashboard del closer (F3):
 * ninguna feature conoce el driver real (memoria hoy, base de datos manana).
 */

import type {
  EnrichedLead,
  LeadListFilters,
  LeadListPage,
  LeadListSort,
  LeadProfile,
} from '@contracts';
import type { Result } from '../../kernel/result.js';

export interface LeadRepository {
  save(profile: LeadProfile): Promise<Result<LeadProfile>>;
  findById(id: string): Promise<Result<LeadProfile>>;
  /** Un lead viable ya enriquecido (F2.1). Es lo que consume el closer. */
  saveEnriched(lead: EnrichedLead): Promise<Result<EnrichedLead>>;
  findEnrichedById(id: string): Promise<Result<EnrichedLead>>;
  /**
   * Listado paginado del dashboard. Solo leads del carril `viable`: el filtrado
   * por carril es una regla de negocio de F3, no una opcion del llamador.
   */
  listViable(
    filters: LeadListFilters,
    sort: LeadListSort,
    pagina: number,
    porPagina: number,
  ): Promise<Result<LeadListPage>>;
}
