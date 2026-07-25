import { describe, expect, it, vi } from 'vitest';
import { InfrastructureError } from '../../../kernel/errors.js';
import { educationJourney, runEducationRepositoryContract } from '../education-repository.contract.js';
import type { AppSupabaseClient } from './supabase-client.js';
import { SupabaseEducationRepository } from './supabase-education.repository.js';

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
        .map((row) => ({ [columns]: jsonb(row[columns] ?? null) }));
      return {
        maybeSingle: () =>
          Promise.resolve({
            data: selected[0] ?? null,
            error: null,
          }),
      };
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

runEducationRepositoryContract(
  'SupabaseEducationRepository',
  () => new SupabaseEducationRepository(createJsonbClient().client),
);

describe('SupabaseEducationRepository', () => {
  it('guarda el journey con upsert idempotente', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn(() => ({ upsert }));
    const repository = new SupabaseEducationRepository(asClient(from));
    const journey = educationJourney('lead-1');

    const result = await repository.save(journey);

    expect(from).toHaveBeenCalledWith('education_journeys');
    expect(upsert).toHaveBeenCalledWith(
      {
        lead_id: journey.leadId,
        journey_payload: journey,
        progreso: journey.progreso,
        puntos_totales: journey.puntosTotales,
        reclasificado_a_viable: journey.reclasificadoAViable,
        updated_at: journey.actualizadoEn,
      },
      { onConflict: 'lead_id' },
    );
    expect(result).toEqual({ ok: true, value: journey });
  });

  it('rehidrata un journey tras un round-trip JSONB realista', async () => {
    const fake = createJsonbClient();
    const repository = new SupabaseEducationRepository(fake.client);
    const journey = educationJourney('jsonb-journey');
    fake.putRow(journey.leadId, { lead_id: journey.leadId, journey_payload: journey });

    const result = await repository.findByLeadId(journey.leadId);

    expect(result).toEqual({ ok: true, value: journey });
    if (result.ok) expect(result.value).not.toBe(journey);
  });

  it('convierte fallos del cliente en InfrastructureError sin filtrar detalles', async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'secret payload value' },
    });
    const repository = new SupabaseEducationRepository(asClient(vi.fn(() => ({ upsert }))));

    const result = await repository.save(educationJourney('fallo'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain('secret payload value');
      expect(result.error.fields).toBeNull();
    }
  });

  it('rechaza un journey almacenado con un formato invalido', async () => {
    const fake = createJsonbClient();
    const repository = new SupabaseEducationRepository(fake.client);
    const damaged = jsonb(educationJourney('invalid-journey'));
    if (!isRecord(damaged)) throw new Error('Fixture invalido');
    damaged['razonesIngreso'] = ['razon_desconocida'];
    fake.putRow('invalid-journey', { lead_id: 'invalid-journey', journey_payload: damaged });

    const result = await repository.findByLeadId('invalid-journey');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain('razon_desconocida');
    }
  });

  it('convierte excepciones del cliente en InfrastructureError sanitizado', async () => {
    const secret = 'credential-like-secret';
    const repository = new SupabaseEducationRepository(
      asClient(
        vi.fn(() => {
          throw new Error(secret);
        }),
      ),
    );

    const result = await repository.findByLeadId('exception');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain(secret);
      expect(result.error.fields).toBeNull();
    }
  });
});
