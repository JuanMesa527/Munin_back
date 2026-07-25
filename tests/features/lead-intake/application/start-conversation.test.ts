/**
 * Tests de `application/start-conversation.use-case.ts`. Task 2.1.
 * design.md Data Flow: `/start` devuelve un `LeadProfile` efimero y NO
 * persistido (D6).
 */

import { describe, expect, it } from 'vitest';
import { StartConversationUseCase } from '../../../../src/features/lead-intake/application/start-conversation.use-case.js';
import type { ClockPort } from '../../../../src/shared/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../src/shared/application/ports/id-generator.port.js';

const AHORA = '2026-07-25T00:00:00.000Z';

function fakeClock(): ClockPort {
  return { now: () => AHORA, nowMs: () => Date.parse(AHORA) };
}

function fakeIds(): IdGeneratorPort {
  let contador = 0;
  return {
    newId: () => {
      contador += 1;
      return `id-${String(contador)}`;
    },
  };
}

describe('StartConversationUseCase', () => {
  it('retorna un LeadProfile efimero, con id pero sin consentimiento ni carril', async () => {
    const useCase = new StartConversationUseCase({ clock: fakeClock(), ids: fakeIds() });
    const resultado = await useCase.execute();

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.profile.id.length).toBeGreaterThan(0);
    expect(resultado.value.profile.consentimiento).toBeNull();
    expect(resultado.value.profile.carril).toBeNull();
  });

  it('el paso siguiente es el gate de consentimiento, y routing es null', async () => {
    const useCase = new StartConversationUseCase({ clock: fakeClock(), ids: fakeIds() });
    const resultado = await useCase.execute();

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.siguientePaso?.tipo).toBe('consentimiento');
    expect(resultado.value.routing).toBeNull();
    expect(resultado.value.mensajes.length).toBeGreaterThan(0);
  });

  it('dos llamadas producen ids distintos (no hay estado compartido/cacheado)', async () => {
    const useCase = new StartConversationUseCase({ clock: fakeClock(), ids: fakeIds() });
    const primero = await useCase.execute();
    const segundo = await useCase.execute();

    expect(primero.ok && segundo.ok).toBe(true);
    if (!primero.ok || !segundo.ok) return;
    expect(primero.value.profile.id).not.toBe(segundo.value.profile.id);
  });
});
