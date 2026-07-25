import { describe, expect, it, vi } from 'vitest';
import type { LeadListFilters, LeadListPage } from '@contracts';
import { InMemoryLeadRepository } from '../../../shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { ok } from '../../../shared/kernel/result.js';
import { ListViableLeadsUseCase } from './list-viable-leads.use-case.js';

describe('ListViableLeadsUseCase', () => {
  it('delega el listado completo al puerto de leads', async () => {
    const filters: LeadListFilters = {
      soloAfiliados: true,
      soloNutridos: null,
      segmento: 'Joven',
      ciudad: 'Bogota',
      scoreMinimo: 70,
      banda: 'media',
      busqueda: null,
    };
    const page: LeadListPage = { items: [], total: 0, pagina: 2, porPagina: 10 };
    const repository = new InMemoryLeadRepository();
    const listViable = vi.spyOn(repository, 'listViable').mockResolvedValue(ok(page));
    const useCase = new ListViableLeadsUseCase(repository);

    const result = await useCase.execute({
      filters,
      sort: 'recencia_desc',
      pagina: 2,
      porPagina: 10,
    });

    expect(result).toEqual(ok(page));
    expect(listViable).toHaveBeenCalledOnce();
    expect(listViable).toHaveBeenCalledWith(filters, 'recencia_desc', 2, 10);
  });
});
