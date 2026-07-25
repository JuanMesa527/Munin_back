/**
 * Tests de `toRow`/`toDomain` de `supabase-lead.repository.ts`. Capa: infrastructure.
 * `config.yaml` marca `integration: false`: estos tests son las UNICAS pruebas
 * automatizadas del adapter — la red y la base de datos reales nunca se tocan
 * (design.md D10, tasks.md 5.2).
 */

import { describe, expect, it } from 'vitest';
import type { LeadProfile } from '@contracts';
import {
  toDomain,
  toRow,
  type SupabaseLeadRow,
} from '../../../../../src/shared/infrastructure/persistence/supabase/supabase-lead.repository.js';

const FILA_VIABLE: SupabaseLeadRow = {
  id: 'lead-1',
  consentimiento: {
    otorgado: true,
    versionPolitica: 'v1',
    finalidades: ['perfilamiento_vivienda'],
    otorgadoEn: '2026-07-20T10:00:00.000Z',
    canal: 'web-chat',
  },
  es_afiliado: true,
  rango_salarial: '2-4 SMMLV',
  segmento: 'Medio',
  personas_a_cargo: 2,
  ciudad: 'Bogota',
  segmento_familiar: 'Pareja con hijos',
  // Trampa 1 del EQUIPO.md: montos COP enteros, NUNCA escalados por 1000 en
  // ninguna direccion.
  ahorro_declarado: 523_620_000,
  capacidad_ahorro_mensual: 1_200_000,
  slots_llenos: ['afiliacion', 'rangoSalarial'],
  capacidad: {
    banda: 'alta',
    faltantes: [],
    cuotaMensualEstimada: 900_000,
    precioMaximoEstimado: 300_000_000,
  },
  score: {
    valor: 82,
    factores: [
      { nombre: 'afiliacion', peso: 0.3, valor: 'si', contribucion: 24.6, intensidad: 100 },
    ],
    weightsVersion: 'v1',
    calculadoEn: '2026-07-20T10:05:00.000Z',
  },
  proyectos: [
    {
      proyectoId: 'proy-1',
      similitud: 0.9,
      razon: 'Coincide con el buyer persona',
      nombre: 'Proyecto 1',
      etapa: 'Única etapa',
      precioDesde: 180_000_000,
      tipologia: 'VIS',
    },
  ],
  carril: 'viable',
  // Postgres devuelve timestamptz con offset, no con "Z" (design.md D10 regla 1).
  created_at: '2026-07-20T10:00:00+00:00',
  updated_at: '2026-07-25T09:00:00+00:00',
};

const FILA_SIN_CLASIFICAR: SupabaseLeadRow = {
  id: 'lead-2',
  consentimiento: null,
  es_afiliado: null,
  rango_salarial: null,
  segmento: null,
  personas_a_cargo: null,
  ciudad: null,
  segmento_familiar: null,
  ahorro_declarado: null,
  capacidad_ahorro_mensual: null,
  slots_llenos: [],
  capacidad: null,
  score: null,
  proyectos: [],
  carril: null,
  created_at: '2026-07-25T00:00:00+00:00',
  updated_at: '2026-07-25T00:00:00+00:00',
};

describe('toDomain', () => {
  it('normaliza timestamptz con offset +00:00 a ISO-8601 con Z', () => {
    const perfil = toDomain(FILA_VIABLE);
    expect(perfil.createdAt).toBe('2026-07-20T10:00:00.000Z');
    expect(perfil.updatedAt).toBe('2026-07-25T09:00:00.000Z');
  });

  it('pasa los montos COP tal cual, sin multiplicar ni dividir por 1000', () => {
    const perfil = toDomain(FILA_VIABLE);
    expect(perfil.ahorroDeclarado).toBe(523_620_000);
    expect(perfil.capacidadAhorroMensual).toBe(1_200_000);
  });

  it('mapea columnas jsonb no nulas contra su schema estrecho', () => {
    const perfil = toDomain(FILA_VIABLE);
    expect(perfil.consentimiento).toEqual({
      otorgado: true,
      versionPolitica: 'v1',
      finalidades: ['perfilamiento_vivienda'],
      otorgadoEn: '2026-07-20T10:00:00.000Z',
      canal: 'web-chat',
    });
    expect(perfil.capacidad?.banda).toBe('alta');
    expect(perfil.score?.valor).toBe(82);
    expect(perfil.proyectos).toHaveLength(1);
    expect(perfil.carril).toBe('viable');
  });

  it('mapea columnas jsonb nulas, slots_llenos vacio y carril null sin fabricar valores', () => {
    const perfil = toDomain(FILA_SIN_CLASIFICAR);
    expect(perfil.consentimiento).toBeNull();
    expect(perfil.capacidad).toBeNull();
    expect(perfil.score).toBeNull();
    expect(perfil.proyectos).toEqual([]);
    expect(perfil.slotsLlenos).toEqual([]);
    expect(perfil.carril).toBeNull();
  });

  it('revienta si el jsonb de consentimiento no cumple el schema (fila corrupta)', () => {
    const fila: SupabaseLeadRow = { ...FILA_SIN_CLASIFICAR, consentimiento: { otorgado: 'si' } };
    expect(() => toDomain(fila)).toThrow();
  });

  it('revienta si score trae confianza fuera de forma (fila corrupta)', () => {
    const fila: SupabaseLeadRow = {
      ...FILA_SIN_CLASIFICAR,
      score: { valor: 'no-es-numero', factores: [], weightsVersion: 'v1', calculadoEn: 'x' },
    };
    expect(() => toDomain(fila)).toThrow();
  });

  it('revienta si carril trae un valor fuera del check constraint esperado', () => {
    const fila: SupabaseLeadRow = { ...FILA_SIN_CLASIFICAR, carril: 'algo-invalido' };
    expect(() => toDomain(fila)).toThrow();
  });

  it('revienta si segmento trae un valor fuera del vocabulario de Segmento', () => {
    const fila: SupabaseLeadRow = { ...FILA_SIN_CLASIFICAR, segmento: 'inventado' };
    expect(() => toDomain(fila)).toThrow();
  });
});

describe('toRow', () => {
  it('mapea LeadProfile a la fila de lead_profiles sin renombrar de mas ni escalar montos', () => {
    const perfil: LeadProfile = toDomain(FILA_VIABLE);
    const fila = toRow(perfil);

    expect(fila).toEqual({
      id: perfil.id,
      consentimiento: perfil.consentimiento,
      es_afiliado: perfil.esAfiliado,
      rango_salarial: perfil.rangoSalarial,
      segmento: perfil.segmento,
      personas_a_cargo: perfil.personasACargo,
      ciudad: perfil.ciudad,
      segmento_familiar: perfil.segmentoFamiliar,
      ahorro_declarado: perfil.ahorroDeclarado,
      capacidad_ahorro_mensual: perfil.capacidadAhorroMensual,
      slots_llenos: perfil.slotsLlenos,
      capacidad: perfil.capacidad,
      score: perfil.score,
      proyectos: perfil.proyectos,
      carril: perfil.carril,
      created_at: perfil.createdAt,
      updated_at: perfil.updatedAt,
    });
  });

  it('conserva un perfil sin clasificar (carril null, proyectos vacios) sin fabricar datos', () => {
    const perfil: LeadProfile = toDomain(FILA_SIN_CLASIFICAR);
    const fila = toRow(perfil);

    expect(fila.carril).toBeNull();
    expect(fila.proyectos).toEqual([]);
    expect(fila.consentimiento).toBeNull();
  });
});
