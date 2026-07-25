import { describe, expect, it, vi } from 'vitest';
import { InfrastructureError } from '../../../kernel/errors.js';
import {
  enrichedLead,
  leadProfile,
  NO_FILTERS,
  runLeadRepositoryContract,
} from '../lead-repository.contract.js';
import type { AppSupabaseClient } from './supabase-client.js';
import { SupabaseLeadRepository } from './supabase-lead.repository.js';

function asClient(from: ReturnType<typeof vi.fn>): AppSupabaseClient {
  return { from } as unknown as AppSupabaseClient;
}

function jsonb(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createJsonbClient(): {
  client: AppSupabaseClient;
  putRow: (leadId: string, row: Record<string, unknown>) => void;
} {
  const rows = new Map<string, Record<string, unknown>>();
  const upsert = vi.fn((value: unknown) => {
    const decoded = jsonb(value);
    if (!isRecord(decoded) || typeof decoded['lead_id'] !== 'string') {
      return Promise.resolve({ data: null, error: { code: 'invalid-test-row' } });
    }
    const previous = rows.get(decoded['lead_id']) ?? {};
    rows.set(decoded['lead_id'], { ...previous, ...decoded });
    return Promise.resolve({ data: null, error: null });
  });
  const select = vi.fn((columns: string) => ({
    eq: vi.fn((column: string, value: unknown) => {
      const selected = [...rows.values()]
        .filter((row) => row[column] === value)
        // `?? null` porque Postgres devuelve NULL para una columna sin valor,
        // nunca `undefined`. Sin esto el doble se comporta distinto de la base
        // real justo en el caso que importa: la fila de un lead que aun no
        // tiene `enriched_payload`.
        .map((row) => ({ [columns]: jsonb(row[columns] ?? null) }));
      const response = { data: selected, error: null };
      return Object.assign(Promise.resolve(response), {
        maybeSingle: () =>
          Promise.resolve({
            data: selected[0] ?? null,
            error: null,
          }),
      });
    }),
  }));
  const from = vi.fn(() => ({ upsert, select }));

  return {
    client: asClient(from),
    putRow: (leadId, row) => {
      rows.set(leadId, jsonb(row) as Record<string, unknown>);
    },
  };
}

runLeadRepositoryContract(
  'SupabaseLeadRepository',
  () => new SupabaseLeadRepository(createJsonbClient().client),
);

describe('SupabaseLeadRepository', () => {
  it('guarda el perfil base con upsert idempotente', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn(() => ({ upsert }));
    const repository = new SupabaseLeadRepository(asClient(from));
    const lead = leadProfile('base-1');

    const result = await repository.save(lead);

    expect(from).toHaveBeenCalledWith('lead_profiles');
    expect(upsert).toHaveBeenCalledWith(
      {
        lead_id: lead.id,
        base_payload: lead,
        carril: lead.carril,
        score: lead.score?.valor ?? null,
        telefono: lead.telefono,
        email: lead.email,
        updated_at: lead.updatedAt,
      },
      { onConflict: 'lead_id' },
    );
    expect(result).toEqual({ ok: true, value: lead });
  });

  it('guarda el lead enriquecido y refresca su perfil base', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn(() => ({ upsert }));
    const repository = new SupabaseLeadRepository(asClient(from));
    const lead = enrichedLead('enriched-1', 90);

    const result = await repository.saveEnriched(lead);

    expect(from).toHaveBeenCalledWith('lead_profiles');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: lead.id,
        base_payload: lead,
        enriched_payload: lead,
        carril: lead.carril,
        score: lead.score?.valor,
        intent_score: lead.intentScore,
        updated_at: lead.updatedAt,
      }),
      { onConflict: 'lead_id' },
    );
    expect(result).toEqual({ ok: true, value: lead });
  });

  it('rehidrata un lead enriquecido tras un round-trip JSONB realista', async () => {
    const fake = createJsonbClient();
    const repository = new SupabaseLeadRepository(fake.client);
    const lead = enrichedLead('jsonb-enriched');
    fake.putRow(lead.id, {
      lead_id: lead.id,
      base_payload: lead,
      enriched_payload: lead,
      carril: 'viable',
    });

    const result = await repository.findEnrichedById(lead.id);

    expect(result).toEqual({ ok: true, value: lead });
    if (result.ok) expect(result.value).not.toBe(lead);
  });

  it('convierte fallos del cliente en InfrastructureError sin filtrar detalles', async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'secret payload value' },
    });
    const repository = new SupabaseLeadRepository(asClient(vi.fn(() => ({ upsert }))));

    const result = await repository.save(leadProfile('fallo'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain('secret payload value');
      expect(result.error.fields).toBeNull();
    }
  });

  it('rechaza un perfil base incompleto aunque conserve sus campos superficiales', async () => {
    const fake = createJsonbClient();
    const repository = new SupabaseLeadRepository(fake.client);
    const damaged = jsonb(leadProfile('invalid-base'));
    if (!isRecord(damaged) || !isRecord(damaged['score'])) {
      throw new Error('Fixture invalido');
    }
    damaged['score'] = { ...damaged['score'], factores: [{ nombre: 'incompleto' }] };
    fake.putRow('invalid-base', {
      lead_id: 'invalid-base',
      base_payload: damaged,
    });

    const result = await repository.findById('invalid-base');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.fields).toBeNull();
    }
  });

  it('rechaza discriminantes anidados alterados en un lead enriquecido', async () => {
    const fake = createJsonbClient();
    const repository = new SupabaseLeadRepository(fake.client);
    const damaged = jsonb(enrichedLead('invalid-enriched'));
    if (!isRecord(damaged)) throw new Error('Fixture invalido');
    damaged['timeline'] = [{ label: 'Alterado', fecha: 'hoy', hito: 'desconocido' }];
    fake.putRow('invalid-enriched', {
      lead_id: 'invalid-enriched',
      enriched_payload: damaged,
    });

    const result = await repository.findEnrichedById('invalid-enriched');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain('desconocido');
    }
  });

  it('convierte errores de listado en InfrastructureError sanitizado', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'internal database detail' },
    });
    const select = vi.fn(() => ({ eq }));
    const repository = new SupabaseLeadRepository(asClient(vi.fn(() => ({ select }))));

    const result = await repository.listViable(NO_FILTERS, 'score_desc', 1, 20);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain('internal database detail');
    }
  });

  it('convierte excepciones del cliente en InfrastructureError sanitizado', async () => {
    const secret = 'credential-like-secret';
    const repository = new SupabaseLeadRepository(
      asClient(
        vi.fn(() => {
          throw new Error(secret);
        }),
      ),
    );

    const result = await repository.findById('exception');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain(secret);
      expect(result.error.fields).toBeNull();
    }
  });
});
