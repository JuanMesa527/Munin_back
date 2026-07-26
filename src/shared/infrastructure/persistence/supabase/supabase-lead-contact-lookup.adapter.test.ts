import { describe, expect, it, vi } from 'vitest';
import { InfrastructureError, NotFoundError } from '../../../kernel/errors.js';
import { SupabaseLeadContactLookup } from './supabase-lead-contact-lookup.adapter.js';
import type { AppSupabaseClient } from './supabase-client.js';

function asClient(from: ReturnType<typeof vi.fn>): AppSupabaseClient {
  return { from } as unknown as AppSupabaseClient;
}

/**
 * Arma el encadenado `from().select().eq().order().limit()` que usa el adapter.
 * `limit` resuelve con lo que devolveria PostgREST: SIEMPRE un arreglo.
 */
function clienteQueDevuelve(resultado: { data: unknown; error: unknown }): {
  from: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
} {
  const limit = vi.fn().mockResolvedValue(resultado);
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, eq, order, limit };
}

describe('SupabaseLeadContactLookup', () => {
  it('resuelve el lead_id filtrando por telefono', async () => {
    const { from, eq } = clienteQueDevuelve({ data: [{ lead_id: 'lead-1' }], error: null });
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: '+573001112233', email: null });

    expect(from).toHaveBeenCalledWith('lead_profiles');
    expect(eq).toHaveBeenCalledWith('telefono', '+573001112233');
    expect(result).toEqual({ ok: true, value: 'lead-1' });
  });

  it('resuelve el lead_id filtrando por email cuando no hay telefono', async () => {
    const { from, eq } = clienteQueDevuelve({ data: [{ lead_id: 'lead-2' }], error: null });
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: null, email: 'persona@correo.com' });

    expect(eq).toHaveBeenCalledWith('email', 'persona@correo.com');
    expect(result).toEqual({ ok: true, value: 'lead-2' });
  });

  /**
   * El contacto NO es unico: F1 crea un `lead_id` por conversacion, asi que
   * quien repite el chat deja varias filas con su mismo correo. Antes esto
   * reventaba (`maybeSingle()` -> PGRST116) y el OTP no salia para los leads
   * que volvieron; ahora gana el mas reciente.
   */
  it('con varias filas del mismo contacto se queda con la mas reciente', async () => {
    const { from, order, limit } = clienteQueDevuelve({
      data: [{ lead_id: 'lead-nuevo' }],
      error: null,
    });
    const lookup = new SupabaseLeadContactLookup(asClient(from));

    const result = await lookup.findLeadIdByContact({ telefono: null, email: 'repetido@correo.com' });

    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({ ok: true, value: 'lead-nuevo' });
  });

  it('devuelve NotFoundError cuando no hay fila', async () => {
    const { from } = clienteQueDevuelve({ data: [], error: null });
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
    const { from } = clienteQueDevuelve({
      data: null,
      error: { code: '42501', message: 'secret detail' },
    });
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
