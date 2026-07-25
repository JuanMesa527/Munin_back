/**
 * Tests de la inferencia por swipes.
 *
 * Protegen la promesa de F2.1: que deslizar tarjetas produzca senal util y no
 * un numero que sube porque si.
 */

import { describe, expect, it } from 'vitest';
import type { ContactIdentity, LeadProfile, ProjectCard, SwipeAction } from '@contracts';
import { LEADS_DEMO } from '../../../shared/infrastructure/persistence/demo-seed.js';
import type { SwipeResuelto } from './swipes.js';
import {
  calcularIntentScore,
  enriquecerConSwipes,
  fichasGuardadas,
  inferirIntereses,
  inferirZonaPreferida,
} from './swipes.js';

function ficha(id: string, sobrescribe: Partial<ProjectCard> = {}): ProjectCard {
  return {
    proyectoId: id,
    nombre: id,
    ubicacion: 'Sector',
    ciudad: 'Bogota',
    zona: 'norte',
    esVIS: true,
    descripcion: 'Ficticio.',
    unidades: 100,
    torres: 1,
    pisos: '6',
    areaDesde: 45,
    areaHasta: null,
    habitacionesDesde: 2,
    habitacionesHasta: 2,
    tipologias: [
      {
        nombre: 'A',
        areaConstruida: 45,
        areaPrivada: 40,
        habitaciones: 2,
        banos: 1,
        precioSMMLV: null,
      },
    ],
    amenidades: ['Gimnasio'],
    lugaresCercanos: [],
    entrega: null,
    certificacionEdge: false,
    salaDeVentas: null,
    brochureUrl: 'https://example.com/b.html',
    imagen: '/proyectos/x.webp',
    precio: { desde: 200_000_000, hasta: 240_000_000, esEstimado: true, metodo: 'test' },
    ...sobrescribe,
  };
}

function swipe(id: string, accion: SwipeAction, card = ficha(id)): SwipeResuelto {
  return {
    evento: {
      leadId: 'lead-prueba',
      proyectoId: id,
      accion,
      decididoEn: '2026-07-25T10:00:00.000Z',
      dwellMs: null,
      abrioDetalle: false,
      detalleMs: null,
    },
    ficha: card,
  };
}

describe('inferirIntereses', () => {
  it('no inventa intereses cuando el usuario no guardo nada', () => {
    expect(inferirIntereses([swipe('a', 'pass'), swipe('b', 'pass')])).toEqual([]);
  });

  it('promueve la amenidad que se repite en al menos la mitad de lo guardado', () => {
    const intereses = inferirIntereses([
      swipe('a', 'like', ficha('a', { amenidades: ['Gimnasio', 'Piscina'] })),
      swipe('b', 'like', ficha('b', { amenidades: ['Gimnasio'] })),
    ]);
    expect(intereses).toContain('Gimnasio');
  });

  it('descarta la amenidad que aparece en un solo proyecto: es ruido, no gusto', () => {
    const intereses = inferirIntereses([
      swipe('a', 'like', ficha('a', { amenidades: ['Piscina'] })),
      swipe('b', 'like', ficha('b', { amenidades: ['Gimnasio'] })),
      swipe('c', 'like', ficha('c', { amenidades: ['Gimnasio'] })),
    ]);
    expect(intereses).not.toContain('Piscina');
  });

  it('ignora lo descartado: un pass no dice que te gusta', () => {
    const intereses = inferirIntereses([
      swipe('a', 'pass', ficha('a', { amenidades: ['Piscina'] })),
      swipe('b', 'like', ficha('b', { amenidades: ['Gimnasio'] })),
    ]);
    expect(intereses).toEqual(['Gimnasio']);
  });
});

describe('inferirZonaPreferida', () => {
  it('devuelve null sin senal, en vez de inventar una zona', () => {
    expect(inferirZonaPreferida([swipe('a', 'pass')])).toBeNull();
  });

  it('un favorito pesa mas que un like', () => {
    const zona = inferirZonaPreferida([
      swipe('a', 'like', ficha('a', { zona: 'norte' })),
      swipe('b', 'favorito', ficha('b', { zona: 'sur' })),
    ]);
    expect(zona).toBe('sur');
  });
});

describe('calcularIntentScore', () => {
  it('es 0 sin swipes', () => {
    expect(calcularIntentScore([])).toBe(0);
  });

  it('nunca se sale de 0..100', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => swipe(`p${String(i)}`, 'favorito'));
    const score = calcularIntentScore(muchos);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('quien recorre y selecciona puntea mas que quien mira dos y se va', () => {
    const decidido = [
      swipe('a', 'like'),
      swipe('b', 'pass'),
      swipe('c', 'pass'),
      swipe('d', 'favorito'),
      swipe('e', 'pass'),
      swipe('f', 'pass'),
      swipe('g', 'pass'),
      swipe('h', 'like'),
    ];
    const tibio = [swipe('a', 'pass'), swipe('b', 'pass')];

    expect(calcularIntentScore(decidido)).toBeGreaterThan(calcularIntentScore(tibio));
  });

  it('darle like a todo puntea menos que ser selectivo: no informa al closer', () => {
    const selectivo = [
      swipe('a', 'like'),
      swipe('b', 'pass'),
      swipe('c', 'pass'),
      swipe('d', 'like'),
      swipe('e', 'pass'),
      swipe('f', 'pass'),
    ];
    const indiscriminado = Array.from({ length: 6 }, (_, i) => swipe(`p${String(i)}`, 'like'));

    expect(calcularIntentScore(selectivo)).toBeGreaterThan(calcularIntentScore(indiscriminado));
  });
});

describe('fichasGuardadas', () => {
  it('pone los favoritos primero: es el orden que quiere ver el closer', () => {
    const guardadas = fichasGuardadas([
      swipe('like-1', 'like'),
      swipe('descartado', 'pass'),
      swipe('favorito-1', 'favorito'),
    ]);
    expect(guardadas.map((f) => f.proyectoId)).toEqual(['favorito-1', 'like-1']);
  });
});

describe('enriquecerConSwipes', () => {
  it('conserva la identidad tokenizada capturada por F1', () => {
    const identidad: ContactIdentity = {
      nombre: 'Familia Ficticia',
      telefonoEnmascarado: '+57 3.. ... ..42',
      contactoTokenId: 'contacto-ficticio',
    };
    const profile = { ...LEADS_DEMO[0]!, identidad } as LeadProfile & {
      identidad: ContactIdentity;
    };

    const enriched = enriquecerConSwipes(profile, [], '2026-07-25T11:00:00.000Z');

    expect(enriched.identidad).toEqual(identidad);
  });

  it('conserva completos los campos A8 aunque el swipe no los pueda inferir', () => {
    const enriched = enriquecerConSwipes(
      LEADS_DEMO[0]!,
      [swipe('favorito-1', 'favorito')],
      '2026-07-25T11:00:00.000Z',
    );

    expect(enriched).toMatchObject({
      edad: null,
      ocupacion: null,
      hogar: expect.any(String),
      contactabilidad: expect.any(Array),
      timeline: expect.any(Array),
    });
  });
});
