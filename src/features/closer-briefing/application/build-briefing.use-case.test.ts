import { describe, expect, it, vi } from 'vitest';
import type { EducationJourney, EnrichedLead } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { EducationJourneyRepository } from '../../../shared/application/ports/education-repository.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import { NotFoundError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import { BuildBriefingUseCase } from './build-briefing.use-case.js';

const NOW = '2026-07-25T15:00:00.000Z';

function makeLead(): EnrichedLead {
  return {
    id: 'lead-1',
    consentimiento: {
      otorgado: true,
      versionPolitica: 'v1',
      finalidades: ['perfilamiento_vivienda', 'contacto_comercial'],
      otorgadoEn: NOW,
      canal: 'web-chat',
    },
    nombre: 'Ada',
    email: 'ada@example.com',
    telefono: '3001234567',
    estadoCivil: 'Soltero/a',
    esAfiliado: true,
    rangoSalarial: '2-4 SMMLV',
    segmento: 'Basico',
    personasACargo: 2,
    ciudad: 'Bogota',
    segmentoFamiliar: 'Pareja con hijos',
    ahorroDeclarado: 20_000_000,
    capacidadAhorroMensual: 1_000_000,
    tieneVivienda: null,
    vinculacionLaboral: null,
    horizonteCompra: null,
    slotsLlenos: ['afiliacion', 'rangoSalarial'],
    capacidad: {
      banda: 'media',
      faltantes: [],
      cuotaMensualEstimada: 900_000,
      precioMaximoEstimado: 200_000_000,
    },
    score: {
      valor: 82,
      factores: [
        {
          nombre: 'Afiliacion',
          peso: 0.3,
          valor: 'Afiliado',
          contribucion: 24,
          intensidad: 80,
        },
      ],
      weightsVersion: 'v1',
      calculadoEn: NOW,
    },
    proyectos: [
      {
        proyectoId: 'project-1',
        similitud: 0.91,
        razon: 'Coincide con capacidad y zona',
        nombre: 'Proyecto Uno',
        etapa: 'Etapa 1',
        precioDesde: 180_000_000,
        tipologia: 'VIS · 3 hab',
        confianza: 1,
        datosFaltantes: [],
        cabeEnCapacidad: true,
      },
    ],
    carril: 'viable',
    createdAt: NOW,
    updatedAt: NOW,
    identidad: {
      nombre: 'Ada',
      telefonoEnmascarado: '+57 3.. ... ..42',
      contactoTokenId: 'token-1',
    },
    intereses: ['zonas verdes'],
    zonaPreferida: 'Sur',
    timingCompra: '6 meses',
    motivacion: 'Vivienda familiar',
    contacto: { canalPreferido: 'telefono', mejorHorario: 'tarde' },
    intentScore: 88,
    enriquecidoEn: NOW,
    edad: 34,
    ocupacion: 'Independiente',
    hogar: '2 personas a cargo',
    ingresosSmmlv: 3.2,
    subsidioEstimado: 30_000_000,
    citaTextual: 'Quiero una vivienda para mi familia',
    contactabilidad: [{ dia: 'L', intensidad: 100 }],
    horarioRazon: 'Respondio en la tarde',
    timeline: [],
  };
}

function makeJourney(): EducationJourney {
  return {
    leadId: 'lead-1',
    plan: {
      precioObjetivo: 180_000_000,
      subsidioEstimado: 30_000_000,
      cuotaInicialObjetivo: 36_000_000,
      gap: 130_000_000,
      mesesParaCalificar: 12,
      proyectoObjetivoId: 'project-1',
      aplicaSubsidio: true,
    },
    metas: [],
    progreso: 0.5,
    puntosTotales: 50,
    badges: [],
    reclasificadoAViable: true,
    razonesIngreso: ['ahorro_insuficiente'],
    actualizadoEn: NOW,
  };
}

function createUseCase(
  journeyResult: Result<EducationJourney> = ok(makeJourney()),
): BuildBriefingUseCase {
  const lead = makeLead();
  const leads = {
    findEnrichedById: vi.fn().mockResolvedValue(ok(lead)),
  } as unknown as LeadRepository;
  const journeys = {
    findByLeadId: vi.fn().mockResolvedValue(journeyResult),
  } as unknown as EducationJourneyRepository;
  const clock: ClockPort = {
    now: () => NOW,
    nowMs: () => Date.parse(NOW),
  };
  return new BuildBriefingUseCase(leads, journeys, clock);
}

describe('BuildBriefingUseCase', () => {
  it('construye una ficha determinista y minima desde datos no sensibles', async () => {
    const result = await createUseCase().execute('lead-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lead.id).toBe('lead-1');
    expect(result.value.journey?.leadId).toBe('lead-1');
    expect(result.value.talkingPoints.length).toBeGreaterThan(0);
    expect(result.value.talkingPoints.map((point) => point.origen)).toEqual(
      expect.arrayContaining(['score', 'matching', 'capacidad', 'intereses']),
    );
    expect(result.value.resumenScore).toContain('82');
    expect(result.value.objeciones.length).toBeGreaterThan(0);
    expect(result.value.alertas).not.toContain(expect.stringMatching(/telefono/i));
    expect(result.value.generadoEn).toBe(NOW);
  });

  it('devuelve journey null cuando el lead nunca paso por nutricion', async () => {
    const result = await createUseCase(
      err(new NotFoundError('Este lead no tiene un plan de nutricion')),
    ).execute('lead-1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.journey).toBeNull();
  });
});
