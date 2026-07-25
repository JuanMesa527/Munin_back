/**
 * Tests de persona.ts. Protegen la garantia mas sensible de F5: que el prompt
 * hacia el LLM nunca lleve PII, y que la dificultad cambie el tono.
 */

import { describe, expect, it } from 'vitest';
import { briefingFixture, TELEFONO_ENMASCARADO_FIXTURE } from './briefing.fixtures.js';
import { buildPersonaContext, buildSystemPrompt, resumirEstado } from './persona.js';
import { turnFixture } from './turn.fixtures.js';

describe('buildPersonaContext', () => {
  it('nunca incluye el telefono, ni siquiera enmascarado', () => {
    const briefing = briefingFixture();
    const persona = buildPersonaContext(briefing);

    const json = JSON.stringify(persona);
    expect(json).not.toContain(TELEFONO_ENMASCARADO_FIXTURE);
    expect(json.toLowerCase()).not.toContain('telefono');
  });

  it('solo toma el primer nombre, nunca apellidos', () => {
    const persona = buildPersonaContext(briefingFixture());
    expect(persona.primerNombre).toBe('Laura');
  });

  it('cae a un nombre generico si no hay identidad', () => {
    const briefing = briefingFixture({
      lead: { ...briefingFixture().lead, identidad: null },
    });
    const persona = buildPersonaContext(briefing);
    expect(persona.primerNombre).toBe('el lead');
  });
});

describe('buildSystemPrompt', () => {
  it('el prompt generado no contiene el telefono enmascarado', () => {
    const persona = buildPersonaContext(briefingFixture());
    const prompt = buildSystemPrompt(persona, 'realista');

    expect(prompt).not.toContain(TELEFONO_ENMASCARADO_FIXTURE);
  });

  it('cambia de tono segun la dificultad', () => {
    const persona = buildPersonaContext(briefingFixture());
    const receptivo = buildSystemPrompt(persona, 'receptivo');
    const dificil = buildSystemPrompt(persona, 'dificil');

    expect(receptivo).not.toBe(dificil);
    expect(dificil.toLowerCase()).toContain('esceptica');
  });

  it('incluye las objeciones reales del briefing, textuales', () => {
    const briefing = briefingFixture();
    const persona = buildPersonaContext(briefing);
    const prompt = buildSystemPrompt(persona, 'realista');

    expect(prompt).toContain(briefing.objeciones[0]?.pregunta);
  });

  it('sin objeciones, el prompt dice explicitamente que es una persona abierta', () => {
    const briefing = briefingFixture({ objeciones: [] });
    const persona = buildPersonaContext(briefing);
    const prompt = buildSystemPrompt(persona, 'realista');

    expect(prompt.toLowerCase()).toContain('abierta a escuchar');
  });
  /**
   * Regresion de un fallo REAL observado en una llamada de prueba: el lead
   * decia "con el ahorro programado si me funciona" y dos turnos despues
   * volvia con "insisto en que la cuota inicial me preocupa". El prompt era
   * identico en todos los turnos, asi que el personaje no tenia forma de saber
   * que esa objecion ya estaba superada ni que iba con el interes por las nubes.
   */
  describe('estado de la conversacion', () => {
    it('le dice al personaje su interes actual, no solo el inicial', () => {
      const persona = buildPersonaContext(briefingFixture());
      const prompt = buildSystemPrompt(persona, 'realista', {
        interes: 82,
        objecionesResueltas: [],
        turnos: 6,
      });

      expect(prompt).toContain('82/100');
      expect(prompt).toContain('6 turnos');
    });

    it('marca como superadas las objeciones ya resueltas', () => {
      const briefing = briefingFixture();
      const objecion = briefing.objeciones[0]?.pregunta ?? '';
      const persona = buildPersonaContext(briefing);
      const prompt = buildSystemPrompt(persona, 'realista', {
        interes: 70,
        objecionesResueltas: [objecion],
        turnos: 4,
      });

      expect(prompt).toContain('YA te las resolvio');
      expect(prompt.toLowerCase()).toContain('no vuelvas a plantearlas');
    });

    it('sin objeciones resueltas no inventa la seccion', () => {
      const persona = buildPersonaContext(briefingFixture());
      const prompt = buildSystemPrompt(persona, 'realista');

      expect(prompt).not.toContain('YA te las resolvio');
    });

    it('el umbral de cierre que se le dice al personaje es el de su dificultad', () => {
      const persona = buildPersonaContext(briefingFixture());

      // Los mismos numeros que usa `verdict.ts`: si el personaje se guiara por
      // otro umbral, actuaria en contra de la aritmetica que lo evalua.
      expect(buildSystemPrompt(persona, 'receptivo')).toContain('55/100');
      expect(buildSystemPrompt(persona, 'realista')).toContain('65/100');
      expect(buildSystemPrompt(persona, 'dificil')).toContain('75/100');
    });
  });

  describe('resumirEstado', () => {
    it('sin historial arranca en el interes inicial', () => {
      expect(resumirEstado([])).toEqual({ interes: 40, objecionesResueltas: [], turnos: 0 });
    });

    it('toma el interes del ULTIMO turno y acumula todas las objeciones resueltas', () => {
      const estado = resumirEstado([
        turnFixture({ indice: 0, interes: 45, objecionesResueltas: ['A'] }),
        turnFixture({ indice: 1, interes: 60, objecionesResueltas: [] }),
        turnFixture({ indice: 2, interes: 78, objecionesResueltas: ['B'] }),
      ]);

      expect(estado.interes).toBe(78);
      expect(estado.turnos).toBe(3);
      expect(estado.objecionesResueltas).toEqual(['A', 'B']);
    });

    it('no duplica una objecion resuelta dos veces', () => {
      const estado = resumirEstado([
        turnFixture({ indice: 0, objecionesResueltas: ['A'] }),
        turnFixture({ indice: 1, objecionesResueltas: ['A'] }),
      ]);

      expect(estado.objecionesResueltas).toEqual(['A']);
    });
  });
});
