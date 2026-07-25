import { describe, expect, it } from 'vitest';
import type { EducationJourney, NurturePlan, ProgressEvent, RoutingDecision } from '@contracts';
import { createEmptyLeadProfile } from '@shared/domain/index.js';
import {
  buildGamifiedJourney,
  checkReadmission,
  configureFechaObjetivo,
  trackProgress,
} from './journey.js';

const NOW = '2026-07-25T00:00:00.000Z';

const PLAN: NurturePlan = {
  precioObjetivo: 120_000_000,
  subsidioEstimado: 32_470_000,
  cuotaInicialObjetivo: 24_000_000,
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

  it('marca la meta de capacidad como opcional si la razón de ingreso no es financiera', () => {
    // Currículo adaptativo (adenda A12): si el lead entró solo por no estar
    // afiliado (no por ahorro/capacidad), forzarle "entendé tu capacidad
    // financiera" no tiene sentido — ya demostró que sabe de plata.
    const profile = createEmptyLeadProfile('lead-3', NOW);
    const journey = buildGamifiedJourney({
      profile,
      routing: { ...ROUTING, razones: ['no_afiliado_sin_cupo'] },
      plan: PLAN,
      now: NOW,
    });
    const edu = journey.metas.find((m) => m.id === 'meta-edu-capacidad');
    expect(edu?.opcional).toBe(true);
  });

  it('NO marca la meta de capacidad como opcional cuando la razón sí es financiera', () => {
    const journey = journeyBase(); // ROUTING incluye 'ahorro_insuficiente'
    const edu = journey.metas.find((m) => m.id === 'meta-edu-capacidad');
    expect(edu?.opcional).toBeUndefined();
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

    journey = trackProgress(journey, evento(30_000_000), NOW, 'aporte-1');
    let ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.completada).toBe(false);
    expect(ahorro?.alcanzado).toBe(30_000_000);

    journey = trackProgress(journey, evento(PLAN.gap), NOW, 'aporte-2');
    ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.completada).toBe(true);
    expect(ahorro?.alcanzado).toBe(PLAN.gap); // acotado al objetivo
    expect(journey.puntosTotales).toBe(100);
    expect(journey.badges.find((b) => b.id === 'badge-ahorrador')?.desbloqueadoEn).toBe(NOW);
    expect(journey.progreso).toBeGreaterThan(0);
  });

  it('agrega un AporteAhorro al historial con el monto y la fecha del evento', () => {
    let journey = journeyBase();
    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: 30_000_000, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );
    let ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.aportes).toEqual([{ id: 'aporte-1', monto: 30_000_000, ocurridoEn: NOW }]);

    const luego = '2026-08-01T00:00:00.000Z';
    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: 10_000_000, ocurridoEn: luego },
      luego,
      'aporte-2',
    );
    ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.aportes).toEqual([
      { id: 'aporte-1', monto: 30_000_000, ocurridoEn: NOW },
      { id: 'aporte-2', monto: 10_000_000, ocurridoEn: luego },
    ]);
    // La acumulacion agregada (`alcanzado`) sigue exactamente igual que antes.
    expect(ahorro?.alcanzado).toBe(40_000_000);
  });

  it('no agrega aporte para eventos que no son ahorro_registrado ni con valor 0', () => {
    let journey = journeyBase();
    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: 0, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );
    const ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.aportes ?? []).toHaveLength(0);
  });

  it('setea completadaEn al now del evento que completa la meta por primera vez', () => {
    let journey = journeyBase();
    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: PLAN.gap, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );
    const ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.completada).toBe(true);
    expect(ahorro?.completadaEn).toBe(NOW);
  });

  it('NO pisa completadaEn en un evento posterior sobre una meta ya completada', () => {
    let journey = journeyBase();
    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: PLAN.gap, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );
    const luego = '2026-08-01T00:00:00.000Z';
    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: 5_000_000, ocurridoEn: luego },
      luego,
      'aporte-2',
    );
    const ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.completada).toBe(true);
    expect(ahorro?.completadaEn).toBe(NOW);
  });
});

describe('configureFechaObjetivo', () => {
  it('setea fechaObjetivo en la meta indicada sin tocar alcanzado/completada/aportes', () => {
    let journey = journeyBase();
    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: 30_000_000, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );
    const luego = '2026-08-01T00:00:00.000Z';
    const fecha = '2027-01-01T00:00:00.000Z';
    journey = configureFechaObjetivo(journey, 'meta-ahorro', fecha, luego);

    const ahorro = journey.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.fechaObjetivo).toBe(fecha);
    expect(ahorro?.alcanzado).toBe(30_000_000);
    expect(ahorro?.completada).toBe(false);
    expect(ahorro?.aportes).toEqual([{ id: 'aporte-1', monto: 30_000_000, ocurridoEn: NOW }]);
    expect(journey.actualizadoEn).toBe(luego);
  });

  it('no afecta otras metas', () => {
    let journey = journeyBase();
    journey = configureFechaObjetivo(journey, 'meta-ahorro', '2027-01-01T00:00:00.000Z', NOW);
    const afiliacion = journey.metas.find((m) => m.id === 'meta-afiliacion');
    expect(afiliacion?.fechaObjetivo).toBeUndefined();
  });
});

describe('checkReadmission', () => {
  it('NO readmite solo con ahorro y afiliación completos: falta el resto del currículo', () => {
    // Regresión: antes bastaba cerrar ahorro+afiliación para graduar al lead a
    // F2.1 al instante, sin pasar por ninguna lección — el punto de F2.2 es
    // nutrir CON educación, no solo trackear un número financiero.
    let journey = journeyBase();
    expect(checkReadmission(journey)).toBe(false);

    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: PLAN.gap, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );
    expect(journey.reclasificadoAViable).toBe(false); // falta afiliación

    journey = trackProgress(
      journey,
      { tipo: 'afiliacion_iniciada', metaId: 'meta-afiliacion', valor: 1, ocurridoEn: NOW },
      NOW,
      'aporte-2',
    );
    // Ahorro + afiliación completos, pero las metas educativas y de
    // documentación siguen pendientes: todavía NO se readmite.
    expect(journey.reclasificadoAViable).toBe(false);
  });

  it('readmite a viable cuando TODAS las metas del recorrido están completas', () => {
    let journey = journeyBase();
    const idsPendientes = journey.metas
      .filter((meta) => meta.tipo !== 'ahorro')
      .map((meta) => meta.id);

    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: PLAN.gap, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );

    for (const metaId of idsPendientes) {
      journey = trackProgress(
        journey,
        { tipo: 'contenido_visto', metaId, valor: 1, ocurridoEn: NOW },
        NOW,
        `evento-${metaId}`,
      );
    }

    expect(journey.progreso).toBe(1);
    expect(journey.reclasificadoAViable).toBe(true);
  });

  it('readmite aunque una meta opcional quede sin completar (currículo adaptativo)', () => {
    // Este es el comportamiento nuevo: antes de la adenda A12, 'meta-edu-capacidad'
    // SIEMPRE contaba, así que dejarla pendiente habría dejado esta prueba en
    // `false` — probamos justamente que una meta opcional no bloquea nada.
    const profile = createEmptyLeadProfile('lead-4', NOW);
    let journey = buildGamifiedJourney({
      profile,
      routing: { ...ROUTING, razones: ['no_afiliado_sin_cupo'] },
      plan: PLAN,
      now: NOW,
    });
    const edu = journey.metas.find((m) => m.id === 'meta-edu-capacidad');
    expect(edu?.opcional).toBe(true); // confirma la premisa del test

    const idsPendientesNoOpcionales = journey.metas
      .filter((meta) => meta.tipo !== 'ahorro' && meta.opcional !== true)
      .map((meta) => meta.id);

    journey = trackProgress(
      journey,
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: PLAN.gap, ocurridoEn: NOW },
      NOW,
      'aporte-1',
    );

    for (const metaId of idsPendientesNoOpcionales) {
      journey = trackProgress(
        journey,
        { tipo: 'contenido_visto', metaId, valor: 1, ocurridoEn: NOW },
        NOW,
        `evento-${metaId}`,
      );
    }

    // 'meta-edu-capacidad' nunca se completó, pero es opcional: no debería
    // impedir la readmisión.
    const capacidadFinal = journey.metas.find((m) => m.id === 'meta-edu-capacidad');
    expect(capacidadFinal?.completada).toBe(false);
    expect(journey.progreso).toBe(1);
    expect(journey.reclasificadoAViable).toBe(true);
  });
});
