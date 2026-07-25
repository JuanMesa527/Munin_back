import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '../../../shared/infrastructure/persistence/supabase/supabase-client.js';
import { SupabaseSwipeStore } from './supabase-swipe.store.js';

describe('SupabaseSwipeStore', () => {
  it('rehidrata filas historicas sin telemetria al contrato canonico', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          lead_id: 'lead-historico',
          proyecto_id: 'proyecto-1',
          accion: 'like',
          decidido_en: '2026-07-25T08:00:00.000Z',
          dwell_ms: null,
          abrio_detalle: null,
        },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as AppSupabaseClient;
    const store = new SupabaseSwipeStore(client);

    const resultado = await store.listByLead('lead-historico');

    expect(resultado).toEqual({
      ok: true,
      value: [
        {
          leadId: 'lead-historico',
          proyectoId: 'proyecto-1',
          accion: 'like',
          decididoEn: '2026-07-25T08:00:00.000Z',
          dwellMs: null,
          abrioDetalle: false,
          detalleMs: null,
        },
      ],
    });
  });
});
