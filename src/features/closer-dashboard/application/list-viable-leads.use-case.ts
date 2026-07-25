import type { LeadListFilters, LeadListPage, LeadListSort } from '@contracts';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import type { Result } from '../../../shared/kernel/result.js';

export interface ListViableLeadsInput {
  filters: LeadListFilters;
  sort: LeadListSort;
  pagina: number;
  porPagina: number;
}

export class ListViableLeadsUseCase {
  constructor(private readonly leads: LeadRepository) {}

  execute(input: ListViableLeadsInput): Promise<Result<LeadListPage>> {
    return this.leads.listViable(input.filters, input.sort, input.pagina, input.porPagina);
  }
}
