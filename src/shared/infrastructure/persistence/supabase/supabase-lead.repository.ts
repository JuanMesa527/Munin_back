import type {
  EnrichedLead,
  LeadListFilters,
  LeadListPage,
  LeadListSort,
  LeadProfile,
} from '@contracts';
import { rankAndPageViableLeads } from '../../../../features/closer-dashboard/domain/lead-ranking.js';
import type { LeadRepository } from '../../../application/ports/lead-repository.port.js';
import { InfrastructureError, NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';
import {
  EnrichedLeadPayloadSchema,
  StoredLeadProfilePayloadSchema,
} from '../lead-payload.codec.js';
import type { AppSupabaseClient } from './supabase-client.js';

const TABLE = 'lead_profiles';

function unavailable(message: string): Result<never> {
  return err(new InfrastructureError(message));
}

export class SupabaseLeadRepository implements LeadRepository {
  constructor(private readonly client: AppSupabaseClient) {}

  async save(profile: LeadProfile): Promise<Result<LeadProfile>> {
    const stored = structuredClone(profile);

    try {
      const { error } = await this.client.from(TABLE).upsert(
        {
          lead_id: stored.id,
          base_payload: stored,
          carril: stored.carril,
          score: stored.score?.valor ?? null,
          updated_at: stored.updatedAt,
        },
        { onConflict: 'lead_id' },
      );

      if (error) return unavailable('No se pudo guardar el lead');
      return ok(structuredClone(stored));
    } catch {
      return unavailable('No se pudo guardar el lead');
    }
  }

  async findById(id: string): Promise<Result<LeadProfile>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('base_payload')
        .eq('lead_id', id)
        .maybeSingle();

      if (error) return unavailable('No se pudo leer el lead');
      if (data === null) return err(new NotFoundError('Lead no encontrado'));
      const payload = StoredLeadProfilePayloadSchema.safeParse(data.base_payload);
      if (!payload.success) {
        return unavailable('El lead almacenado tiene un formato invalido');
      }

      return ok(structuredClone(payload.data));
    } catch {
      return unavailable('No se pudo leer el lead');
    }
  }

  async saveEnriched(lead: EnrichedLead): Promise<Result<EnrichedLead>> {
    const stored = structuredClone(lead);

    try {
      const { error } = await this.client.from(TABLE).upsert(
        {
          lead_id: stored.id,
          base_payload: stored,
          enriched_payload: stored,
          carril: stored.carril,
          score: stored.score?.valor ?? null,
          intent_score: stored.intentScore,
          updated_at: stored.updatedAt,
        },
        { onConflict: 'lead_id' },
      );

      if (error) return unavailable('No se pudo guardar el lead enriquecido');
      return ok(structuredClone(stored));
    } catch {
      return unavailable('No se pudo guardar el lead enriquecido');
    }
  }

  async findEnrichedById(id: string): Promise<Result<EnrichedLead>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('enriched_payload')
        .eq('lead_id', id)
        .maybeSingle();

      if (error) return unavailable('No se pudo leer el lead enriquecido');
      if (data?.enriched_payload === null || data === null) {
        return err(new NotFoundError('Lead enriquecido no encontrado'));
      }
      const payload = EnrichedLeadPayloadSchema.safeParse(data.enriched_payload);
      if (!payload.success) {
        return unavailable('El lead enriquecido almacenado tiene un formato invalido');
      }

      return ok(structuredClone(payload.data));
    } catch {
      return unavailable('No se pudo leer el lead enriquecido');
    }
  }

  async listViable(
    filters: LeadListFilters,
    sort: LeadListSort,
    pagina: number,
    porPagina: number,
  ): Promise<Result<LeadListPage>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('enriched_payload')
        .eq('carril', 'viable');

      if (error) return unavailable('No se pudieron listar los leads viables');

      const leads: EnrichedLead[] = [];
      for (const row of data) {
        const payload = EnrichedLeadPayloadSchema.safeParse(row.enriched_payload);
        if (!payload.success) {
          return unavailable('Un lead viable almacenado tiene un formato invalido');
        }
        leads.push(structuredClone(payload.data));
      }

      return ok(rankAndPageViableLeads(leads, filters, sort, pagina, porPagina));
    } catch {
      return unavailable('No se pudieron listar los leads viables');
    }
  }
}
