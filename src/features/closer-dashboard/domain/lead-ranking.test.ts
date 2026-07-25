import { describe, expect, it } from 'vitest';
import type { EnrichedLead, LeadListFilters, ProjectMatch } from '@contracts';
import { rankAndPageViableLeads, toViableLeadListItem } from './lead-ranking.js';

const SIN_FILTROS: LeadListFilters = {
  soloAfiliados: null,
  soloNutridos: null,
  segmento: null,
  ciudad: null,
  scoreMinimo: null,
  banda: null,
  busqueda: null,
};

const PROYECTO: ProjectMatch = {
  proyectoId: 'proyecto-1',
  similitud: 0.8,
  razon: 'Afinidad de prueba',
  nombre: 'Proyecto Uno',
  etapa: 'Etapa 1',
  precioDesde: 180_000_000,
  tipologia: 'VIS · 2 hab',
};

function lead(id: string, overrides: Partial<EnrichedLead> = {}): EnrichedLead {
  return {
    id,
    consentimiento: null,
    nombre: null,
    email: null,
    telefono: null,
    estadoCivil: null,
    esAfiliado: true,
    rangoSalarial: '2-4 SMMLV',
    segmento: 'Basico',
    personasACargo: 1,
    ciudad: 'Bogota',
    segmentoFamiliar: 'Pareja con hijos',
    ahorroDeclarado: 20_000_000,
    capacidadAhorroMensual: 900_000,
    tieneVivienda: null,
    vinculacionLaboral: null,
    horizonteCompra: null,
    slotsLlenos: [],
    capacidad: {
      banda: 'media',
      faltantes: [],
      cuotaMensualEstimada: 1_100_000,
      precioMaximoEstimado: 220_000_000,
    },
    score: {
      valor: 80,
      factores: [
        { nombre: 'A', peso: 1, valor: 'a', contribucion: 5, intensidad: 80 },
        { nombre: 'B', peso: 1, valor: 'b', contribucion: 12, intensidad: 90 },
        { nombre: 'C', peso: 1, valor: 'c', contribucion: -2, intensidad: 30 },
        { nombre: 'D', peso: 1, valor: 'd', contribucion: 3, intensidad: 60 },
      ],
      weightsVersion: 'test-v1',
      calculadoEn: '2026-07-25T10:00:00.000Z',
    },
    proyectos: [PROYECTO],
    carril: 'viable',
    createdAt: '2026-07-25T09:00:00.000Z',
    updatedAt: '2026-07-25T10:00:00.000Z',
    identidad: {
      nombre: `Lead ${id}`,
      telefonoEnmascarado: '+57 3.. ... ..42',
      contactoTokenId: `token-${id}`,
    },
    intereses: [],
    zonaPreferida: null,
    timingCompra: null,
    motivacion: null,
    contacto: null,
    intentScore: 70,
    enriquecidoEn: '2026-07-25T10:00:00.000Z',
    edad: 32,
    ocupacion: 'Empleado',
    hogar: null,
    ingresosSmmlv: 3,
    subsidioEstimado: null,
    citaTextual: null,
    contactabilidad: [],
    horarioRazon: null,
    timeline: [],
    ...overrides,
  };
}

describe('toViableLeadListItem', () => {
  it('proyecta solo los datos de lista y ordena los tres factores de mayor aporte', () => {
    const item = toViableLeadListItem(lead('mapeado'));

    expect(item).toMatchObject({
      leadId: 'mapeado',
      nombre: 'Lead mapeado',
      score: 80,
      banda: 'media',
      capacidadEstimada: 220_000_000,
      cuotaEstimada: 1_100_000,
      proyectoTop: PROYECTO,
      actualizadoEn: '2026-07-25T10:00:00.000Z',
    });
    expect(item.topFactores.map((factor) => factor.nombre)).toEqual(['B', 'A', 'D']);
  });

  it('detecta un lead recuperado por nutricion desde su recorrido', () => {
    const item = toViableLeadListItem(
      lead('nutrido', {
        timeline: [{ label: 'Completó nutrición', fecha: '25 jul', hito: 'nutricion' }],
      }),
    );

    expect(item.vieneDeNutricion).toBe(true);
  });
});

describe('rankAndPageViableLeads', () => {
  it('excluye no viables y aplica todos los filtros estructurados', () => {
    const objetivo = lead('objetivo', {
      segmento: 'Joven',
      ciudad: 'Soacha',
      score: { ...lead('base').score!, valor: 90 },
      capacidad: { ...lead('base').capacidad!, banda: 'alta' },
      timeline: [{ label: 'Nutrición', fecha: '25 jul', hito: 'nutricion' }],
    });
    const page = rankAndPageViableLeads(
      [
        objetivo,
        lead('no-afiliado', { esAfiliado: false }),
        lead('otro-segmento'),
        lead('no-viable', { carril: 'no_viable' }),
      ],
      {
        ...SIN_FILTROS,
        soloAfiliados: true,
        soloNutridos: true,
        segmento: 'Joven',
        ciudad: 'Soacha',
        scoreMinimo: 85,
        banda: 'alta',
      },
      'score_desc',
      1,
      20,
    );

    expect(page.items.map((item) => item.leadId)).toEqual(['objetivo']);
  });

  it('ignora busqueda en servidor para no procesar PII', () => {
    const page = rankAndPageViableLeads(
      [lead('visible')],
      { ...SIN_FILTROS, busqueda: 'nombre que no coincide' },
      'score_desc',
      1,
      20,
    );

    expect(page.items.map((item) => item.leadId)).toEqual(['visible']);
  });

  it('ordena por intención y desempata por recencia y leadId', () => {
    const page = rankAndPageViableLeads(
      [
        lead('z-reciente', {
          intentScore: 90,
          updatedAt: '2026-07-25T11:00:00.000Z',
        }),
        lead('b-antiguo', {
          intentScore: 90,
          updatedAt: '2026-07-25T09:00:00.000Z',
        }),
        lead('a-reciente', {
          intentScore: 90,
          updatedAt: '2026-07-25T11:00:00.000Z',
        }),
        lead('menor', { intentScore: 60 }),
      ],
      SIN_FILTROS,
      'intent_desc',
      1,
      20,
    );

    expect(page.items.map((item) => item.leadId)).toEqual([
      'a-reciente',
      'z-reciente',
      'b-antiguo',
      'menor',
    ]);
  });

  it('ordena por capacidad y por score con los mismos desempates estables', () => {
    const altaAntigua = lead('alta-antigua', {
      capacidad: { ...lead('base').capacidad!, precioMaximoEstimado: 300_000_000 },
      updatedAt: '2026-07-25T09:00:00.000Z',
    });
    const altaReciente = lead('alta-reciente', {
      capacidad: { ...lead('base').capacidad!, precioMaximoEstimado: 300_000_000 },
      updatedAt: '2026-07-25T11:00:00.000Z',
    });

    expect(
      rankAndPageViableLeads(
        [altaAntigua, altaReciente],
        SIN_FILTROS,
        'capacidad_desc',
        1,
        20,
      ).items.map((item) => item.leadId),
    ).toEqual(['alta-reciente', 'alta-antigua']);
    expect(
      rankAndPageViableLeads(
        [altaAntigua, altaReciente],
        SIN_FILTROS,
        'score_desc',
        1,
        20,
      ).items.map((item) => item.leadId),
    ).toEqual(['alta-reciente', 'alta-antigua']);
  });

  it('pagina después de filtrar y conserva el total previo al corte', () => {
    const page = rankAndPageViableLeads(
      [
        lead('score-90', { score: { ...lead('base').score!, valor: 90 } }),
        lead('score-80', { score: { ...lead('base').score!, valor: 80 } }),
        lead('score-70', { score: { ...lead('base').score!, valor: 70 } }),
      ],
      SIN_FILTROS,
      'score_desc',
      2,
      1,
    );

    expect(page).toMatchObject({ total: 3, pagina: 2, porPagina: 1 });
    expect(page.items.map((item) => item.leadId)).toEqual(['score-80']);
  });
});
