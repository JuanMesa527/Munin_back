import { describe, expect, it, vi } from 'vitest';
import { InfrastructureError, NotFoundError } from '../../../kernel/errors.js';
import { SupabaseLeadContactLookup } from './supabase-lead-contact-lookup.adapter.js';
import type { AppSupabaseClient } from './supabase-client.js';

function asClient(from: ReturnType<typeof vi.fn>): AppSupabaseClient {
  return { from } as unknown as AppSupabaseClient;
}

describe('SupabaseLeadContactLookup', () => {
  it('resuelve el lead_id filtrando por telefono', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { lead_id: 'lead-1' }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: '+573001112233', email: null });

    expect(from).toHaveBeenCalledWith('lead_profiles');
    expect(eq).toHaveBeenCalledWith('telefono', '+573001112233');
    expect(result).toEqual({ ok: true, value: 'lead-1' });
  });

  it('resuelve el lead_id filtrando por email cuando no hay telefono', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { lead_id: 'lead-2' }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: null, email: 'persona@correo.com' });

    expect(eq).toHaveBeenCalledWith('email', 'persona@correo.com');
    expect(result).toEqual({ ok: true, value: 'lead-2' });
  });

  it('devuelve NotFoundError cuando no hay fila', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: '+573000000000', email: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it('devuelve NotFoundError cuando no viene ni telefono ni email', async () => {
    const from = vi.fn();
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: null, email: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
    expect(from).not.toHaveBeenCalled();
  });

  it('convierte fallos del cliente en InfrastructureError sanitizado', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '42501', message: 'secret detail' } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: '+573000000000', email: null });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain('secret detail');
    }
  });

  it('convierte excepciones del cliente en InfrastructureError sanitizado', async () => {
    const secret = 'credential-like-secret';
    const lookup = new SupabaseLeadContactLookup(
      asClient(
        vi.fn(() => {
          throw new Error(secret);
        }),
      ),
    );

    const result = await lookup.findLeadIdByContact({ telefono: '+573000000000', email: null });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InfrastructureError);
      expect(result.error.message).not.toContain(secret);
    }
  });
});
