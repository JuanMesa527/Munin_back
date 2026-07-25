/**
 * Tests de `features/lead-intake/domain/conversation.ts`.
 * Spec: lead-intake-conversation "Bounded, Inference-First Question Flow",
 * "Non-Affiliation Never Short-Circuits the Flow".
 */

import { describe, expect, it } from 'vitest';
import type { LeadProfile } from '@contracts';
import { createEmptyLeadProfile } from '../../../../src/shared/domain/lead.js';
import {
  buildBotMessage,
  computeProgress,
  getNextStep,
  isReadyToRoute,
  parseAnswer,
  updateProfile,
} from '../../../../src/features/lead-intake/domain/conversation.js';

const AHORA = '2026-07-25T00:00:00.000Z';

function perfilBase(overrides: Partial<LeadProfile> = {}): LeadProfile {
  return { ...createEmptyLeadProfile('lead-1', AHORA), ...overrides };
}

const CAMPOS_IDENTIDAD = {
  nombre: 'Ana',
  email: 'ana@example.com',
  telefono: '3001234567',
  edad: 30,
  estadoCivil: 'Soltero/a',
  ocupacion: 'Empleado',
} as const;

const SLOTS_IDENTIDAD = [
  'nombre',
  'email',
  'telefono',
  'edad',
  'estadoCivil',
  'ocupacion',
] as const;

describe('getNextStep', () => {
  it('pregunta nombre primero cuando el perfil esta vacio', () => {
    const paso = getNextStep(perfilBase());
    expect(paso).not.toBeNull();
    expect(paso?.slot).toBe('nombre');
    expect(paso?.tipo).toBe('pregunta');
    expect(paso?.quickReplies).toEqual([]);
  });

  it('usa el copy y quickReplies exactos confirmados para rangoSalarial', () => {
    const perfil = perfilBase({
      ...CAMPOS_IDENTIDAD,
      slotsLlenos: [...SLOTS_IDENTIDAD, 'afiliacion'],
      esAfiliado: true,
    });
    const paso = getNextStep(perfil);
    expect(paso?.slot).toBe('rangoSalarial');
    expect(paso?.quickReplies).toEqual([
      { label: '0-2 SMMLV', value: '0-2 SMMLV' },
      { label: '2-4 SMMLV', value: '2-4 SMMLV' },
      { label: '4-6 SMMLV', value: '4-6 SMMLV' },
      { label: '6-10 SMMLV', value: '6-10 SMMLV' },
      { label: '>10 SMMLV', value: '>10 SMMLV' },
    ]);
  });

  it('salta un slot ya inferido (segmentoFamiliar) y pregunta ciudad', () => {
    const perfil = perfilBase({
      ...CAMPOS_IDENTIDAD,
      slotsLlenos: [
        ...SLOTS_IDENTIDAD,
        'afiliacion',
        'rangoSalarial',
        'segmento',
        'segmentoFamiliar',
        'personasACargo',
      ],
      esAfiliado: true,
      rangoSalarial: '2-4 SMMLV',
      segmento: 'Medio',
      segmentoFamiliar: 'Pareja con hijos',
      personasACargo: 2,
    });
    const paso = getNextStep(perfil);
    expect(paso?.slot).toBe('ciudad');
  });

  it('retorna null cuando los slots preguntados ya estan llenos', () => {
    const perfil = perfilBase({
      ...CAMPOS_IDENTIDAD,
      slotsLlenos: [
        ...SLOTS_IDENTIDAD,
        'afiliacion',
        'rangoSalarial',
        'segmentoFamiliar',
        'ciudad',
        'ahorro',
        'capacidadAhorroMensual',
      ],
      esAfiliado: true,
      rangoSalarial: '2-4 SMMLV',
      segmentoFamiliar: 'Pareja con hijos',
      ciudad: 'Bogotá',
      ahorroDeclarado: 5_000_000,
      capacidadAhorroMensual: 500_000,
    });
    expect(getNextStep(perfil)).toBeNull();
  });

  it('no tiene rama de afiliacion: un no-afiliado sigue recibiendo la siguiente pregunta normal', () => {
    const perfil = perfilBase({
      ...CAMPOS_IDENTIDAD,
      slotsLlenos: [...SLOTS_IDENTIDAD, 'afiliacion'],
      esAfiliado: false,
    });
    const paso = getNextStep(perfil);
    expect(paso?.slot).toBe('rangoSalarial');
  });
});

describe('parseAnswer', () => {
  it('parsea "Sí" como afiliacion true', () => {
    const resultado = parseAnswer('afiliacion', 'Sí');
    expect(resultado).toEqual({ ok: true, value: { slot: 'afiliacion', valor: true } });
  });

  it('parsea "no" como afiliacion false', () => {
    const resultado = parseAnswer('afiliacion', 'no');
    expect(resultado).toEqual({ ok: true, value: { slot: 'afiliacion', valor: false } });
  });

  it('rechaza texto no interpretable para afiliacion', () => {
    const resultado = parseAnswer('afiliacion', 'tal vez');
    expect(resultado.ok).toBe(false);
  });

  it('parsea un rango salarial exacto del vocabulario', () => {
    const resultado = parseAnswer('rangoSalarial', '2-4 SMMLV');
    expect(resultado).toEqual({ ok: true, value: { slot: 'rangoSalarial', valor: '2-4 SMMLV' } });
  });

  it('rechaza un rango salarial fuera del vocabulario', () => {
    const resultado = parseAnswer('rangoSalarial', 'mucho dinero');
    expect(resultado.ok).toBe(false);
  });

  it('parsea un monto de ahorro con formato de miles', () => {
    const resultado = parseAnswer('ahorro', '$10.000.000');
    expect(resultado).toEqual({ ok: true, value: { slot: 'ahorro', valor: 10_000_000 } });
  });

  it('parsea el valor numerico crudo de un chip de ahorro', () => {
    const resultado = parseAnswer('ahorro', '5000000');
    expect(resultado).toEqual({ ok: true, value: { slot: 'ahorro', valor: 5_000_000 } });
  });

  it('rechaza un monto sin digitos', () => {
    const resultado = parseAnswer('capacidadAhorroMensual', 'no tengo idea');
    expect(resultado.ok).toBe(false);
  });

  it('acepta cualquier texto no vacio para ciudad (vocabulario abierto)', () => {
    const resultado = parseAnswer('ciudad', 'Villavicencio');
    expect(resultado).toEqual({ ok: true, value: { slot: 'ciudad', valor: 'Villavicencio' } });
  });

  it('es una funcion pura: mismo input siempre produce el mismo output', () => {
    const primero = parseAnswer('rangoSalarial', '0-2 SMMLV');
    const segundo = parseAnswer('rangoSalarial', '0-2 SMMLV');
    expect(primero).toEqual(segundo);
  });
});

describe('updateProfile', () => {
  it('llena el slot directo y lo agrega a slotsLlenos', () => {
    const perfil = perfilBase();
    const actualizado = updateProfile(perfil, { slot: 'afiliacion', valor: true }, AHORA);
    expect(actualizado.esAfiliado).toBe(true);
    expect(actualizado.slotsLlenos).toContain('afiliacion');
    expect(actualizado.updatedAt).toBe(AHORA);
  });

  it('D8: infiere segmento "Basico" desde rangoSalarial "0-2 SMMLV" (<2)', () => {
    const perfil = perfilBase();
    const actualizado = updateProfile(perfil, { slot: 'rangoSalarial', valor: '0-2 SMMLV' }, AHORA);
    expect(actualizado.segmento).toBe('Basico');
    expect(actualizado.slotsLlenos).toContain('segmento');
  });

  it('D8: infiere segmento "Medio" desde rangoSalarial "4-6 SMMLV" (2-6)', () => {
    const perfil = perfilBase();
    const actualizado = updateProfile(perfil, { slot: 'rangoSalarial', valor: '4-6 SMMLV' }, AHORA);
    expect(actualizado.segmento).toBe('Medio');
  });

  it('D8: infiere segmento "Alto" desde rangoSalarial ">10 SMMLV" (>6)', () => {
    const perfil = perfilBase();
    const actualizado = updateProfile(perfil, { slot: 'rangoSalarial', valor: '>10 SMMLV' }, AHORA);
    expect(actualizado.segmento).toBe('Alto');
  });

  it('D8: nunca infiere "Joven" desde rangoSalarial', () => {
    const perfil = perfilBase();
    const actualizado = updateProfile(
      perfil,
      { slot: 'rangoSalarial', valor: '6-10 SMMLV' },
      AHORA,
    );
    expect(actualizado.segmento).not.toBe('Joven');
  });

  it('D8: infiere personasACargo desde segmentoFamiliar', () => {
    const perfil = perfilBase();
    const actualizado = updateProfile(
      perfil,
      { slot: 'segmentoFamiliar', valor: 'Unipersonal' },
      AHORA,
    );
    expect(actualizado.personasACargo).toBe(0);
    expect(actualizado.slotsLlenos).toContain('personasACargo');
  });

  it('D8: "Pareja con hijos" infiere mas personas a cargo que "Unipersonal"', () => {
    const perfil = perfilBase();
    const actualizado = updateProfile(
      perfil,
      { slot: 'segmentoFamiliar', valor: 'Pareja con hijos' },
      AHORA,
    );
    expect(actualizado.personasACargo).toBeGreaterThan(0);
  });
});

describe('isReadyToRoute', () => {
  it('retorna false cuando faltan preguntas', () => {
    const perfil = perfilBase({ slotsLlenos: ['nombre'], nombre: 'Ana' });
    expect(isReadyToRoute(perfil)).toBe(false);
  });

  it('retorna true cuando los slots preguntados estan llenos, incluso para no-afiliados', () => {
    const perfil = perfilBase({
      ...CAMPOS_IDENTIDAD,
      slotsLlenos: [
        ...SLOTS_IDENTIDAD,
        'afiliacion',
        'rangoSalarial',
        'segmentoFamiliar',
        'ciudad',
        'ahorro',
        'capacidadAhorroMensual',
      ],
      esAfiliado: false,
      rangoSalarial: '2-4 SMMLV',
      segmentoFamiliar: 'Pareja con hijos',
      ciudad: 'Cali',
      ahorroDeclarado: 1_000_000,
      capacidadAhorroMensual: 200_000,
    });
    expect(isReadyToRoute(perfil)).toBe(true);
  });
});

describe('computeProgress', () => {
  it('retorna 0 con el perfil vacio', () => {
    expect(computeProgress(perfilBase())).toBe(0);
  });

  it('retorna 0.5 con 6 de los 12 slots preguntados llenos (identidad)', () => {
    const perfil = perfilBase({
      ...CAMPOS_IDENTIDAD,
      slotsLlenos: [...SLOTS_IDENTIDAD],
    });
    expect(computeProgress(perfil)).toBeCloseTo(6 / 12);
  });

  it('retorna 1 cuando los slots preguntados estan llenos', () => {
    const perfil = perfilBase({
      ...CAMPOS_IDENTIDAD,
      slotsLlenos: [
        ...SLOTS_IDENTIDAD,
        'afiliacion',
        'rangoSalarial',
        'segmentoFamiliar',
        'ciudad',
        'ahorro',
        'capacidadAhorroMensual',
      ],
      esAfiliado: true,
      rangoSalarial: '2-4 SMMLV',
      segmentoFamiliar: 'Pareja con hijos',
      ciudad: 'Cali',
      ahorroDeclarado: 1_000_000,
      capacidadAhorroMensual: 200_000,
    });
    expect(computeProgress(perfil)).toBe(1);
  });
});

describe('buildBotMessage', () => {
  it('construye un BotMessage con emisor bot y los datos dados', () => {
    const mensaje = buildBotMessage({
      id: 'msg-1',
      texto: '¿Estás afiliado a Colsubsidio?',
      quickReplies: [
        { label: 'Sí', value: 'true' },
        { label: 'No', value: 'false' },
      ],
      now: AHORA,
    });
    expect(mensaje).toEqual({
      id: 'msg-1',
      texto: '¿Estás afiliado a Colsubsidio?',
      quickReplies: [
        { label: 'Sí', value: 'true' },
        { label: 'No', value: 'false' },
      ],
      emisor: 'bot',
      enviadoEn: AHORA,
    });
  });
});
