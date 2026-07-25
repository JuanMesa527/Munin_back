/**
 * Tests de `shared/domain/lead.ts`. Spec: lead-intake-conversation
 * "Consent Gate Enforced in Domain".
 */

import { describe, expect, it } from 'vitest';
import type { LeadProfile } from '@contracts';
import {
  createEmptyLeadProfile,
  hasConsent,
  isSlotFilled,
  missingSlots,
} from '../../../src/shared/domain/lead.js';

const AHORA = '2026-07-25T00:00:00.000Z';
const VERSION_ACTIVA = 'v1';

function perfilBase(overrides: Partial<LeadProfile> = {}): LeadProfile {
  return { ...createEmptyLeadProfile('lead-1', AHORA), ...overrides };
}

describe('hasConsent', () => {
  it('retorna false cuando no hay consentimiento', () => {
    const perfil = perfilBase({ consentimiento: null });
    expect(hasConsent(perfil, VERSION_ACTIVA)).toBe(false);
  });

  it('retorna false cuando la version de la politica no coincide con la vigente', () => {
    const perfil = perfilBase({
      consentimiento: {
        otorgado: true,
        versionPolitica: 'v0-vieja',
        finalidades: ['perfilamiento_vivienda'],
        otorgadoEn: AHORA,
        canal: 'web-chat',
      },
    });
    expect(hasConsent(perfil, VERSION_ACTIVA)).toBe(false);
  });

  it('retorna false cuando otorgado es false aunque la version coincida', () => {
    const perfil = perfilBase({
      consentimiento: {
        otorgado: false,
        versionPolitica: VERSION_ACTIVA,
        finalidades: ['perfilamiento_vivienda'],
        otorgadoEn: AHORA,
        canal: 'web-chat',
      },
    });
    expect(hasConsent(perfil, VERSION_ACTIVA)).toBe(false);
  });

  it('retorna true cuando otorgado es true y la version coincide con la vigente', () => {
    const perfil = perfilBase({
      consentimiento: {
        otorgado: true,
        versionPolitica: VERSION_ACTIVA,
        finalidades: ['perfilamiento_vivienda'],
        otorgadoEn: AHORA,
        canal: 'web-chat',
      },
    });
    expect(hasConsent(perfil, VERSION_ACTIVA)).toBe(true);
  });
});

describe('missingSlots', () => {
  it('retorna los 8 slots en el orden de SLOTS cuando slotsLlenos esta vacio', () => {
    const perfil = perfilBase({ slotsLlenos: [] });
    expect(missingSlots(perfil)).toEqual([
      'afiliacion',
      'rangoSalarial',
      'segmento',
      'personasACargo',
      'ciudad',
      'segmentoFamiliar',
      'ahorro',
      'capacidadAhorroMensual',
    ]);
  });

  it('excluye los slots llenos preservando el orden de SLOTS', () => {
    const perfil = perfilBase({ slotsLlenos: ['ciudad', 'afiliacion'] });
    expect(missingSlots(perfil)).toEqual([
      'rangoSalarial',
      'segmento',
      'personasACargo',
      'segmentoFamiliar',
      'ahorro',
      'capacidadAhorroMensual',
    ]);
  });
});

describe('isSlotFilled', () => {
  it('retorna true cuando el slot esta en slotsLlenos Y el campo tiene valor', () => {
    const perfil = perfilBase({ slotsLlenos: ['afiliacion'], esAfiliado: true });
    expect(isSlotFilled(perfil, 'afiliacion')).toBe(true);
  });

  it('retorna false cuando el slot esta en slotsLlenos pero el campo esta desincronizado en null', () => {
    const perfil = perfilBase({ slotsLlenos: ['afiliacion'], esAfiliado: null });
    expect(isSlotFilled(perfil, 'afiliacion')).toBe(false);
  });

  it('retorna false cuando el campo tiene valor pero el slot no esta en slotsLlenos', () => {
    const perfil = perfilBase({ slotsLlenos: [], esAfiliado: true });
    expect(isSlotFilled(perfil, 'afiliacion')).toBe(false);
  });

  it('distingue esAfiliado: false (valor valido) de null (sin valor)', () => {
    const perfil = perfilBase({ slotsLlenos: ['afiliacion'], esAfiliado: false });
    expect(isSlotFilled(perfil, 'afiliacion')).toBe(true);
  });
});
