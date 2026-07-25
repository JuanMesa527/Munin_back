import { describe, expect, it } from 'vitest';
import type { EducationJourney, NurturePlan, ProgressEvent, RoutingDecision } from '@contracts';
import { createEmptyLeadProfile } from '@shared/domain/index.js';
import { buildGamifiedJourney, checkReadmission, trackProgress } from './journey.js';

const NOW = '2026-07-25T00:00:00.000Z';

const PLAN: NurturePlan = {
  precioObjetivo: 120_000_000,
  subsidioEstimado: 32_470_000,
  gap: 77_530_000,
  mesesParaCalificar: 78,
  proyectoObjetivoId: 'proj-norte-1',
  aplicaSubsidio: true,
};

const ROUTING: RoutingDecision = {
  carril: 'no_viable',
  razones: ['ahorro_insuficiente', 'no_afiliado_sin_cupo'],
  explicacion: 'Todavía no, pero acá está tu camino.',
  decididoEn: NOW,
};

function journeyBase(): EducationJourney {
  const profile = { ...createEmptyLeadProfile('lead-1', NOW), esAfiliado: false };
  return buildGamifiedJourney({ profile, routing: ROUTING, plan: PLAN, now: NOW });
}

describe('buildGamifiedJourney', () => {
  it('arranca en cero, con las 5 etapas y las razones de ingreso', () => {
    const journey = journeyBase();
    expect(journey.progreso).toBe(0);
    expect(journey.puntosTotales).toBe(0);
    expect(journey.reclasificadoAViable).toBe(false);
    expect(journey.etapas).toHaveLength(5);
    expect(journey.razonesIngreso).toEqual(['ahorro_insuficiente', 'no_afiliado_sin_cupo']);
  });

  it('crea la meta de ahorro con objetivo = gap y la de afiliación', () => {
    const journey = journeyBase();
    const ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    const afiliacion = journey.metas.find((m) => m.id === 'meta-afiliacion');
    expect(ahorro?.objetivo).toBe(PLAN.gap);
    expect(afiliacion).toBeDefined();
  });

  it('crea la meta educativa de capacidad, lista para marcarse con la lectura', () => {
    const journey = journeyBase();
    const edu = journey.metas.find((m) => m.id === 'meta-edu-capacidad');
    expect(edu).toBeDefined();
    expect(edu?.titulo).toBe('Entendé tu capacidad financiera');
    expect(edu?.etapa).toBe('capacidad');
    expect(edu?.completada).toBe(false);
    expect(edu?.puntos).toBe(30);
  });

  it('omite la meta de ahorro cuando no hay brecha', () => {
    const profile = createEmptyLeadProfile('lead-2', NOW);
    const journey = buildGamifiedJourney({
      profile,
      routing: { ...ROUTING, razones: ['datos_insuficientes'] },
      plan: { ...PLAN, gap: 0 },
      now: NOW,
    });
    expect(journey.metas.find((m) => m.id === 'meta-ahorro')).toBeUndefined();
  });
});

describe('trackProgress', () => {
  it('acumula ahorro, completa la meta, suma puntos y desbloquea el badge', () => {
    let journey = journeyBase();
    const evento = (valor: number): ProgressEvent => ({
      tipo: 'ahorro_registrado',
      metaId: 'meta-ahorro',
      valor,
      ocurridoEn: NOW,
    });

    journey = trackProgress(journey, evento(30_000_000), NOW);
    let ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.completada).toBe(false);
    expect(ahorro?.alcanzado).toBe(30_000_000);

    journey = trackProgress(journey, evento(PLAN.gap), NOW);
    ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.completada).toBe(true);
    expect(ahorro?.alcanzado).toBe(PLAN.gap); // acotado al objetivo
    expect(journey.puntosTotales).toBe(100);
    expect(journey.badges.find((b) => b.id === 'badge-ahorrador')?.desbloqueadoEn).toBe(NOW);
    expect(journey.progreso).toBeGreaterThan(0);
  });
});

describe('checkReadmission', () => {
  it('readmite a viable solo cuando ahorro y afiliación están completos', () => {
    let journey = journeyBase();
    expect(checkReadmission(journey)).toBe(false);

    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: PLAN.gap, ocurridoEn: NOW },
      NOW,
    );
    expect(journey.reclasificadoAViable).toBe(false); // falta afiliación

    journey = trackProgress(
      journey,
      { tipo: 'afiliacion_iniciada', metaId: 'meta-afiliacion', valor: 1, ocurridoEn: NOW },
      NOW,
    );
    expect(journey.reclasificadoAViable).toBe(true);
  });
});
