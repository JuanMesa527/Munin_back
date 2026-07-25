/**
 * Tests de `inferirGenero`. Pura, sin red.
 *
 * Los casos NO son decorativos: cada uno es un nombre frecuente en Colombia
 * donde la heuristica simple del `-a` final se equivoca. Si alguien "limpia"
 * las listas de excepciones creyendo que sobran, estos tests lo cazan.
 */

import { describe, expect, it } from 'vitest';
import { inferirGenero } from './gender.js';

describe('inferirGenero', () => {
  it('resuelve los casos regulares por terminacion', () => {
    expect(inferirGenero('Laura')).toBe('femenino');
    expect(inferirGenero('Marta')).toBe('femenino');
    expect(inferirGenero('Carlos')).toBe('masculino');
    expect(inferirGenero('Julian')).toBe('masculino');
  });

  it('acierta en masculinos terminados en -a, donde la heuristica fallaria', () => {
    expect(inferirGenero('Nicolas')).toBe('masculino');
    expect(inferirGenero('Matias')).toBe('masculino');
    expect(inferirGenero('Elias')).toBe('masculino');
  });

  it('acierta en femeninos que no terminan en -a', () => {
    expect(inferirGenero('Luz')).toBe('femenino');
    expect(inferirGenero('Beatriz')).toBe('femenino');
    expect(inferirGenero('Carmen')).toBe('femenino');
    expect(inferirGenero('Mercedes')).toBe('femenino');
  });

  it('ignora tildes y mayusculas', () => {
    expect(inferirGenero('ANDRÉS')).toBe('masculino');
    expect(inferirGenero('Rocío')).toBe('femenino');
    expect(inferirGenero('Inés')).toBe('femenino');
  });

  it('usa solo el PRIMER nombre', () => {
    expect(inferirGenero('Laura Restrepo M.')).toBe('femenino');
    expect(inferirGenero('Carlos Andres Pena')).toBe('masculino');
  });

  it('no revienta con nombre vacio, nulo o solo espacios', () => {
    expect(inferirGenero(null)).toBe('masculino');
    expect(inferirGenero(undefined)).toBe('masculino');
    expect(inferirGenero('')).toBe('masculino');
    expect(inferirGenero('   ')).toBe('masculino');
  });

  it('es estable: el mismo nombre da siempre lo mismo', () => {
    // La voz no puede alternar entre turnos de la misma llamada.
    const repetido = Array.from({ length: 5 }, () => inferirGenero('Laura'));
    expect(new Set(repetido).size).toBe(1);
  });
});
