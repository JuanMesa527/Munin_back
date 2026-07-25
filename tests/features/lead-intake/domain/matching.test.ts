/**
 * Tests de `features/lead-intake/domain/matching.ts`. Spec: lead-intake-matching.
 */

import { describe, expect, it } from 'vitest';
import type { CapacityBand, LeadProfile, ProjectProfile } from '@contracts';
import { createEmptyLeadProfile } from '../../../../src/shared/domain/lead.js';
import {
  explainMatch,
  filterByEligibility,
  matchProjects,
} from '../../../../src/features/lead-intake/domain/matching.js';

const AHORA = '2026-07-25T00:00:00.000Z';

function perfilBase(overrides: Partial<LeadProfile> = {}): LeadProfile {
  return { ...createEmptyLeadProfile('lead-1', AHORA), ...overrides };
}

function proyecto(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    proyectoId: 'proy-1',
    nombre: 'Torres del Parque',
    ciudad: 'Bogotá',
    zona: 'norte',
    precioDesde: 100_000_000,
    precioHasta: 200_000_000,
    esVIS: true,
    perfilComprador: { segmento: { Medio: 0.6, Alto: 0.3 } },
    proporcionAfiliados: 0.7,
    // Por defecto el fixture SI esta calibrado: la mayoria de los casos ejercitan
    // el camino normal. El caso sin calibrar se pide explicito con el override.
    perfilCalibrado: true,
    ...overrides,
  };
}

const CAPACIDAD_ALTA: CapacityBand = {
  banda: 'alta',
  faltantes: [],
  cuotaMensualEstimada: 3_000_000,
  precioMaximoEstimado: 250_000_000,
};

describe('filterByEligibility', () => {
  it('descarta proyectos por encima del precio maximo estimado', () => {
    const perfil = perfilBase();
    const capacidadBaja: CapacityBand = {
      banda: 'baja',
      faltantes: [],
      cuotaMensualEstimada: 200_000,
      precioMaximoEstimado: 50_000_000,
    };
    const elegibles = filterByEligibility(
      [proyecto({ precioDesde: 100_000_000 })],
      perfil,
      capacidadBaja,
    );
    expect(elegibles).toHaveLength(0);
  });

  it('incluye proyectos dentro del precio maximo estimado', () => {
    const perfil = perfilBase();
    const elegibles = filterByEligibility(
      [proyecto({ precioDesde: 100_000_000 })],
      perfil,
      CAPACIDAD_ALTA,
    );
    expect(elegibles).toHaveLength(1);
  });

  it('filtra por ciudad cuando el perfil la declaro', () => {
    const perfil = perfilBase({ ciudad: 'Medellín' });
    const elegibles = filterByEligibility(
      [proyecto({ ciudad: 'Bogotá' }), proyecto({ proyectoId: 'proy-2', ciudad: 'Medellín' })],
      perfil,
      CAPACIDAD_ALTA,
    );
    expect(elegibles).toHaveLength(1);
    expect(elegibles[0]?.proyectoId).toBe('proy-2');
  });

  it('retorna vacio cuando no hay precioMaximoEstimado (datos insuficientes)', () => {
    const perfil = perfilBase();
    const capacidadSinPrecio: CapacityBand = {
      banda: 'baja',
      faltantes: ['ahorro'],
      cuotaMensualEstimada: null,
      precioMaximoEstimado: null,
    };
    const elegibles = filterByEligibility([proyecto()], perfil, capacidadSinPrecio);
    expect(elegibles).toHaveLength(0);
  });

  it('excluye proyectos casi exclusivos de afiliados para un lead no-afiliado (margen 90/10)', () => {
    const perfil = perfilBase({ esAfiliado: false });
    const elegibles = filterByEligibility(
      [proyecto({ proporcionAfiliados: 0.98 })],
      perfil,
      CAPACIDAD_ALTA,
    );
    expect(elegibles).toHaveLength(0);
  });
});

describe('matchProjects', () => {
  it('no tiene dependencia de LlmPort en su firma (solo elegibles + profile, limite es opcional)', () => {
    expect(matchProjects.length).toBe(2);
  });

  it('cada match trae una razon no vacia', () => {
    const perfil = perfilBase({ segmento: 'Medio' });
    const matches = matchProjects([proyecto()], perfil);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.razon.length).toBeGreaterThan(0);
  });

  it('ordena por similitud descendente', () => {
    const perfil = perfilBase({ segmento: 'Medio' });
    const bajaAfinidad = proyecto({
      proyectoId: 'baja',
      perfilComprador: { segmento: { Medio: 0.1 } },
    });
    const altaAfinidad = proyecto({
      proyectoId: 'alta',
      perfilComprador: { segmento: { Medio: 0.9 } },
    });
    const matches = matchProjects([bajaAfinidad, altaAfinidad], perfil);
    expect(matches[0]?.proyectoId).toBe('alta');
    expect(matches[0]?.similitud).toBeGreaterThan(matches[1]?.similitud ?? 1);
  });

  it('respeta el limite de resultados', () => {
    const perfil = perfilBase({ segmento: 'Medio' });
    const proyectos = [
      proyecto({ proyectoId: 'p1' }),
      proyecto({ proyectoId: 'p2' }),
      proyecto({ proyectoId: 'p3' }),
    ];
    expect(matchProjects(proyectos, perfil, 2)).toHaveLength(2);
  });
});

describe('explainMatch', () => {
  it('fundamenta la razon en el atributo de mayor coincidencia', () => {
    const perfil = perfilBase({ segmento: 'Medio' });
    const { razon, hechos } = explainMatch(proyecto(), perfil);
    expect(razon).toContain('Torres del Parque');
    expect(hechos.segmento).toBe('60%');
  });

  it('cae a una razon fundamentada en precio/ciudad cuando no hay coincidencia de perfilComprador', () => {
    const perfil = perfilBase();
    const { razon, hechos } = explainMatch(proyecto({ perfilComprador: {} }), perfil);
    expect(razon.length).toBeGreaterThan(0);
    expect(hechos.ciudad).toBe('Bogotá');
  });

  it('NO cita porcentajes de compradores mientras el perfil no este calibrado', () => {
    // "El 60% de compradores comparten tu segmento" se lee como un hecho medido
    // sobre 4.142 personas. Con `perfilCalibrado: false` esas proporciones son
    // una heuristica escrita a mano: publicarlas seria inventar una estadistica
    // sobre compradores que no existen.
    const perfil = perfilBase({ segmento: 'Medio' });
    const { razon, hechos } = explainMatch(proyecto({ perfilCalibrado: false }), perfil);

    expect(razon).not.toContain('%');
    expect(razon).not.toContain('compradores');
    expect(hechos.segmento).toBeUndefined();
    // Sigue fundamentada, nunca vacia: cae a los hechos que SI son verificables.
    expect(hechos.ciudad).toBe('Bogotá');
  });

  it('declara confianza 0 cuando el ranking sale de perfiles sin calibrar', () => {
    const perfil = perfilBase({ segmento: 'Medio' });
    const [match] = matchProjects([proyecto({ perfilCalibrado: false })], perfil);

    expect(match!.confianza).toBe(0);
    expect(match!.datosFaltantes).toContain('el perfil real de compradores de este proyecto');
  });
});
