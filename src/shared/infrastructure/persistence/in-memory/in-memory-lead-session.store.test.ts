import { describe, expect, it } from 'vitest';
import type { ClockPort } from '../../../application/ports/clock.port.js';
import { UnauthorizedError } from '../../../kernel/errors.js';
import { InMemoryLeadSessionStore } from './in-memory-lead-session.store.js';

const AHORA_MS = Date.parse('2026-07-25T15:00:00.000Z');

describe('InMemoryLeadSessionStore', () => {
  it('emite un token y lo valida contra el leadId original', async () => {
    const clock: ClockPort = { now: () => new Date(AHORA_MS).toISOString(), nowMs: () => AHORA_MS };
    const store = new InMemoryLeadSessionStore({ clock, ttlMinutos: 60 });

    const issued = await store.issue('lead-1');
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const verified = await store.verify(issued.value.token);
    expect(verified).toEqual({
      ok: true,
      value: { leadId: 'lead-1', expiraEn: '2026-07-25T16:00:00.000Z' },
    });
  });

  it('rechaza un token inexistente', async () => {
    const clock: ClockPort = { now: () => new Date(AHORA_MS).toISOString(), nowMs: () => AHORA_MS };
    const store = new InMemoryLeadSessionStore({ clock, ttlMinutos: 60 });

    const result = await store.verify('token-que-no-existe');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(UnauthorizedError);
  });

  it('rechaza un token vencido', async () => {
    let nowMs = AHORA_MS;
    const clock: ClockPort = { now: () => new Date(nowMs).toISOString(), nowMs: () => nowMs };
    const store = new InMemoryLeadSessionStore({ clock, ttlMinutos: 60 });
    const issued = await store.issue('lead-1');
    if (!issued.ok) throw new Error('setup invalido');

    nowMs += 60 * 60 * 1000 + 1;
    const result = await store.verify(issued.value.token);

    expect(result.ok).toBe(false);
  });

  it('revocar es idempotente y el token dejar de servir tras revocarlo', async () => {
    const clock: ClockPort = { now: () => new Date(AHORA_MS).toISOString(), nowMs: () => AHORA_MS };
    const store = new InMemoryLeadSessionStore({ clock, ttlMinutos: 60 });
    const issued = await store.issue('lead-1');
    if (!issued.ok) throw new Error('setup invalido');

    expect(await store.revoke(issued.value.token)).toEqual({ ok: true, value: undefined });
    expect(await store.revoke(issued.value.token)).toEqual({ ok: true, value: undefined });
    const result = await store.verify(issued.value.token);
    expect(result.ok).toBe(false);
  });
});
