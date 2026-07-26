/**
 * Tests de la parte pura del adapter: `parseTurnResponseContent`. Sin red
 * (`config.yaml` `integration: false`), igual que los tests del adapter de F1.
 * Protege la: un JSON malformado o incompleto nunca debe convertirse en un
 * turno fabricado.
 */

import { describe, expect, it } from 'vitest';
import { parseTurnResponseContent } from './deepseek-call-simulator.adapter.js';

describe('parseTurnResponseContent', () => {
  it('acepta un turno bien formado', () => {
    const resultado = parseTurnResponseContent(
      JSON.stringify({
        respuesta: 'Cuéntame más de eso.',
        mood: 'interesado',
        deltaInteres: 8,
        objecionesPlanteadas: [],
        objecionesResueltas: [],
      }),
    );
    expect(resultado.ok).toBe(true);
  });

  it('rechaza JSON invalido, sin lanzar', () => {
    const resultado = parseTurnResponseContent('esto no es json');
    expect(resultado.ok).toBe(false);
  });

  /**
   * Caso REAL de `deepseek-v4-flash` con `json_object`: ~1 de cada 3 llamadas
   * devuelve solo espacios con `finish_reason: "stop"`. Se fija en un test
   * para que nadie "simplifique" el reintento del adapter creyendo que la
   * cadena en blanco es un caso teorico.
   */
  it('rechaza contenido en blanco, que es lo que devuelve el modelo al fallar', () => {
    expect(parseTurnResponseContent('                              ').ok).toBe(false);
    expect(parseTurnResponseContent('').ok).toBe(false);
  });

  it('rechaza un turno sin deltaInteres, nunca inventa un default', () => {
    const resultado = parseTurnResponseContent(
      JSON.stringify({
        respuesta: 'Hola',
        mood: 'neutral',
        objecionesPlanteadas: [],
        objecionesResueltas: [],
      }),
    );
    expect(resultado.ok).toBe(false);
  });

  it('rechaza un mood fuera del enum permitido', () => {
    const resultado = parseTurnResponseContent(
      JSON.stringify({
        respuesta: 'Hola',
        mood: 'furioso',
        deltaInteres: 0,
        objecionesPlanteadas: [],
        objecionesResueltas: [],
      }),
    );
    expect(resultado.ok).toBe(false);
  });

  it('rechaza deltaInteres fuera de -20..20', () => {
    const resultado = parseTurnResponseContent(
      JSON.stringify({
        respuesta: 'Hola',
        mood: 'neutral',
        deltaInteres: 999,
        objecionesPlanteadas: [],
        objecionesResueltas: [],
      }),
    );
    expect(resultado.ok).toBe(false);
  });
});
