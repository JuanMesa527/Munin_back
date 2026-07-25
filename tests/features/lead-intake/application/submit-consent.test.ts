/**
 * Tests de `application/submit-consent.use-case.ts`. Task 2.3.
 * design.md D6: el servidor mintea el id (nunca lo acepta del cliente); la
 * primera escritura a `LeadRepository` ocurre aqui. Threat matrix:
 * "Processing/persisting without consent" y "client-controlled identifier".
 */

import { describe, expect, it } from 'vitest';
import type { LeadProfile } from '@contracts';
import { SubmitConsentUseCase } from '../../../../src/features/lead-intake/application/submit-consent.use-case.js';
import type { ClockPort } from '../../../../src/shared/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../src/shared/application/ports/id-generator.port.js';
import type { LeadRepository } from '../../../../src/shared/application/ports/lead-repository.port.js';
import { ok } from '../../../../src/shared/kernel/result.js';

const AHORA = '2026-07-25T00:00:00.000Z';
const VERSION_ACTIVA = 'v1';

function fakeClock(): ClockPort {
  return { now: () => AHORA, nowMs: () => Date.parse(AHORA) };
}

function fakeIds(prefijo = 'lead'): IdGeneratorPort {
  let contador = 0;
  return {
    newId: () => {
      contador += 1;
      return `${prefijo}-${String(contador)}`;
    },
  };
}

function fakeLeadRepository(): LeadRepository & { guardados: LeadProfile[] } {
  const guardados: LeadProfile[] = [];
  return {
    guardados,
    save: (profile) => {
      guardados.push(profile);
      return Promise.resolve(ok(profile));
    },
    findById: () => {
      throw new Error('no usado en estos tests');
    },
    saveEnriched: () => {
      throw new Error('no usado en estos tests');
    },
    findEnrichedById: () => {
      throw new Error('no usado en estos tests');
    },
    listViable: () => {
      throw new Error('no usado en estos tests');
    },
  };
}

describe('SubmitConsentUseCase', () => {
  it('mintea el id server-side y persiste en el primer save', async () => {
    const leads = fakeLeadRepository();
    const useCase = new SubmitConsentUseCase({
      leads,
      clock: fakeClock(),
      ids: fakeIds(),
      activePolicyVersion: VERSION_ACTIVA,
    });

    const resultado = await useCase.execute({
      otorgado: true,
      versionPolitica: VERSION_ACTIVA,
      finalidades: ['perfilamiento_vivienda'],
      canal: 'web-chat',
    });

    expect(resultado.ok).toBe(true);
    expect(leads.guardados).toHaveLength(1);
    if (!resultado.ok) return;
    expect(resultado.value.profile.id).toBe(leads.guardados[0]?.id);
    expect(resultado.value.profile.consentimiento?.otorgado).toBe(true);
    expect(resultado.value.siguientePaso?.slot).toBe('nombre');
  });

  it('ConsentRequiredError cuando otorgado es false, y nada se persiste', async () => {
    const leads = fakeLeadRepository();
    const useCase = new SubmitConsentUseCase({
      leads,
      clock: fakeClock(),
      ids: fakeIds(),
      activePolicyVersion: VERSION_ACTIVA,
    });

    const resultado = await useCase.execute({
      otorgado: false,
      versionPolitica: VERSION_ACTIVA,
      finalidades: ['perfilamiento_vivienda'],
      canal: 'web-chat',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('CONSENT_REQUIRED');
    expect(leads.guardados).toHaveLength(0);
  });

  it('ConsentRequiredError cuando la versionPolitica no coincide con la vigente, y nada se persiste', async () => {
    const leads = fakeLeadRepository();
    const useCase = new SubmitConsentUseCase({
      leads,
      clock: fakeClock(),
      ids: fakeIds(),
      activePolicyVersion: VERSION_ACTIVA,
    });

    const resultado = await useCase.execute({
      otorgado: true,
      versionPolitica: 'v0-vieja',
      finalidades: ['perfilamiento_vivienda'],
      canal: 'web-chat',
    });

    expect(resultado.ok).toBe(false);
    expect(leads.guardados).toHaveLength(0);
  });

  it('ignora cualquier leadId que hubiera llegado en el input y mintea el suyo (D6)', async () => {
    const leads = fakeLeadRepository();
    const ids = fakeIds('mintado');
    const useCase = new SubmitConsentUseCase({
      leads,
      clock: fakeClock(),
      ids,
      activePolicyVersion: VERSION_ACTIVA,
    });

    const resultado = await useCase.execute({
      otorgado: true,
      versionPolitica: VERSION_ACTIVA,
      finalidades: ['perfilamiento_vivienda'],
      canal: 'web-chat',
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.profile.id.startsWith('mintado-')).toBe(true);
  });
});
