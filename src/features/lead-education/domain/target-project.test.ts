import { describe, expect, it } from 'vitest';
import type { ProjectProfile } from '@contracts';
import { createEmptyLeadProfile } from '@shared/domain/index.js';
import { PROYECTO_POR_DEFECTO, elegirProyectoObjetivo } from './target-project.js';

function proyecto(id: string, ciudad: string, precioDesde: number): ProjectProfile {
  return {
    proyectoId: id,
    nombre: id,
    ciudad,
    zona: 'otra',
    precioDesde,
    precioHasta: precioDesde + 50_000_000,
    esVIS: true,
    perfilComprador: {},
    proporcionAfiliados: 0.9,
  };
}

const PERFIL = createEmptyLeadProfile('lead-1', '2026-07-25T00:00:00.000Z');

describe('elegirProyectoObjetivo', () => {
  it('cae al proyecto de referencia cuando no hay catálogo', () => {
    expect(elegirProyectoObjetivo(PERFIL, []).proyectoId).toBe(PROYECTO_POR_DEFECTO.proyectoId);
  });

  it('elige el más alcanzable (menor precio de entrada)', () => {
    const elegido = elegirProyectoObjetivo(PERFIL, [
      proyecto('caro', 'Bogotá', 200_000_000),
      proyecto('barato', 'Bogotá', 120_000_000),
    ]);
    expect(elegido.proyectoId).toBe('barato');
  });

  it('prioriza la ciudad declarada por el lead', () => {
    const elegido = elegirProyectoObjetivo({ ...PERFIL, ciudad: 'Medellín' }, [
      proyecto('bogota-barato', 'Bogotá', 100_000_000),
      proyecto('medellin', 'Medellín', 150_000_000),
    ]);
    expect(elegido.proyectoId).toBe('medellin');
  });
});
