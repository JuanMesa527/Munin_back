/**
 * La ficha del closer no puede tener campos decorativos: cada dato o sale de
 * algo que el titular declaro, o no sale. Estos tests fijan las dos mitades de
 * esa regla — que lo declarado LLEGUE, y que lo no declarado se quede en null.
 */

import { describe, expect, it } from 'vitest';
import type { EducationJourney, LeadProfile, PreferenciaContacto } from '@contracts';
import { createEmptyLeadProfile } from '@shared/domain/lead.js';
import { enriquecerConSwipes } from './swipes.js';

const AHORA = '2026-07-25T15:00:00.000Z';

function leadDeclarado(overrides: Partial<LeadProfile> = {}): LeadProfile {
  return {
    ...createEmptyLeadProfile('lead-ficha', '2026-07-25T10:00:00.000Z'),
    consentimiento: {
      otorgado: true,
      versionPolitica: 'v1',
      finalidades: ['perfilamiento_vivienda'],
      otorgadoEn: '2026-07-25T10:05:00.000Z',
      canal: 'web-chat',
    },
    edad: 27,
    ocupacion: 'Diseñadora freelance',
    rangoSalarial: '2-4 SMMLV',
    horizonteCompra: 'ya',
    tieneVivienda: false,
    segmentoFamiliar: 'Pareja con hijos',
    carril: 'viable',
    score: {
      valor: 82,
      factores: [],
      weightsVersion: 'v1',
      calculadoEn: '2026-07-25T10:30:00.000Z',
    },
    ...overrides,
  };
}

const PREFERENCIA: PreferenciaContacto = { dias: ['L', 'X', 'V'], franjas: ['tarde'] };

describe('campos declarados de la ficha', () => {
  it('los ingresos salen del rango declarado, como cota inferior', () => {
    const ficha = enriquecerConSwipes(leadDeclarado(), [], AHORA);
    // `2-4 SMMLV` -> 2. El punto medio (3) seria inventar precision que el
    // titular nunca dio; la cota inferior es verdad y nunca sobreestima.
    expect(ficha.ingresosSmmlv).toBe(2);
  });

  it('sin rango declarado los ingresos quedan en null, no en cero', () => {
    const ficha = enriquecerConSwipes(leadDeclarado({ rangoSalarial: null }), [], AHORA);
    expect(ficha.ingresosSmmlv).toBeNull();
  });

  it('el subsidio se estima con la tabla compartida y respeta el gate de primera vivienda', () => {
    const aspira = enriquecerConSwipes(leadDeclarado(), [], AHORA);
    expect(aspira.subsidioEstimado).toBeGreaterThan(0);

    const yaPropietario = enriquecerConSwipes(
      leadDeclarado({ tieneVivienda: true }),
      [],
      AHORA,
    );
    // `null` y no `0`: "no aspira" no es lo mismo que "le dieron cero".
    expect(yaPropietario.subsidioEstimado).toBeNull();
  });

  it('el timing sale del horizonte declarado en F1', () => {
    expect(enriquecerConSwipes(leadDeclarado(), [], AHORA).timingCompra).toBe('Quiere comprar ya');
    expect(
      enriquecerConSwipes(leadDeclarado({ horizonteCompra: null }), [], AHORA).timingCompra,
    ).toBeNull();
  });

  it('el recorrido usa los timestamps reales del lead, sin hitos decorativos', () => {
    const ficha = enriquecerConSwipes(leadDeclarado(), [], AHORA);
    const hitos = ficha.timeline.map((evento) => evento.hito);

    expect(hitos).toEqual(['ingreso', 'consentimiento', 'perfilamiento', 'viable']);
    // Sin journey NO aparece el hito de nutricion: ese lead nunca paso por ahi.
    expect(hitos).not.toContain('nutricion');
    for (const evento of ficha.timeline) {
      expect(evento.fecha.length).toBeGreaterThan(0);
    }
  });

  it('el hito de nutricion aparece solo cuando existe un journey real', () => {
    const journey = {
      leadId: 'lead-ficha',
      progreso: 0.4,
      actualizadoEn: '2026-07-25T12:00:00.000Z',
    } as unknown as EducationJourney;

    const ficha = enriquecerConSwipes(leadDeclarado(), [], AHORA, {
      journey,
      preferenciaContacto: null,
    });

    expect(ficha.timeline.map((evento) => evento.hito)).toContain('nutricion');
  });

  it('la franja preferida y su razon salen de lo que el titular eligio', () => {
    const ficha = enriquecerConSwipes(leadDeclarado(), [], AHORA, {
      journey: null,
      preferenciaContacto: PREFERENCIA,
    });

    expect(ficha.contacto).toEqual({ canalPreferido: 'telefono', mejorHorario: 'tarde' });
    expect(ficha.horarioRazon).toMatch(/lunes, miércoles, viernes/u);
    // Solo los dias elegidos quedan encendidos: la barra no simula un historico
    // de llamadas que no existe.
    expect(ficha.contactabilidad.filter((dia) => dia.intensidad > 0).map((dia) => dia.dia)).toEqual([
      'L',
      'X',
      'V',
    ]);
  });

  it('sin respuesta de horario no se inventa uno', () => {
    const ficha = enriquecerConSwipes(leadDeclarado(), [], AHORA);
    expect(ficha.contacto).toBeNull();
    expect(ficha.horarioRazon).toBeNull();
    expect(ficha.contactabilidad).toEqual([]);
  });

  it('lo que nadie declaro se queda en null en vez de rellenarse', () => {
    const ficha = enriquecerConSwipes(leadDeclarado(), [], AHORA);
    // No persistimos la transcripcion del chat: no hay frase real que citar.
    expect(ficha.citaTextual).toBeNull();
    // Nadie pregunta la motivacion todavia.
    expect(ficha.motivacion).toBeNull();
  });
});
