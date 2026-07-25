import { describe, expect, it } from 'vitest';
import { mismaAreaMetropolitana, mismaCiudad, normalizarCiudad } from './city.js';

describe('normalizarCiudad', () => {
  it('colapsa tildes, mayusculas y espacios al mismo valor', () => {
    const escrituras = ['Bogotá', 'bogota', ' BOGOTÁ ', 'Bogota'];
    const normalizadas = new Set(escrituras.map(normalizarCiudad));
    expect(normalizadas).toEqual(new Set(['bogota']));
  });

  it('no toca la ñ, que es una letra y no un acento', () => {
    // Borrar diacriticos con NFD tambien puede comerse la tilde de la ñ si se
    // hace mal. `Muña`, `Cañasgordas` y compania quedarian mal escritas.
    expect(normalizarCiudad('Cañasgordas')).toBe('cañasgordas');
  });
});

describe('mismaCiudad', () => {
  it('reconoce el chip del chat contra el nombre del catalogo', () => {
    // ESTE es el caso que rompia la ficha: el chip trae tilde, el catalogo no.
    expect(mismaCiudad('Bogotá', 'Bogota')).toBe(true);
  });

  it('sigue distinguiendo ciudades distintas', () => {
    expect(mismaCiudad('Bucaramanga', 'Bogota')).toBe(false);
    expect(mismaCiudad('Medellín', 'Bogotá')).toBe(false);
  });
});

describe('mismaAreaMetropolitana', () => {
  it('trata la sabana como area de influencia de Bogota, con o sin tilde', () => {
    expect(mismaAreaMetropolitana('Bogotá', 'Soacha')).toBe(true);
    expect(mismaAreaMetropolitana('Chía', 'Bogota')).toBe(true);
    expect(mismaAreaMetropolitana('Tocancipá', 'Bogotá')).toBe(true);
  });

  it('una ciudad de otra region no entra al area de Bogota', () => {
    expect(mismaAreaMetropolitana('Bucaramanga', 'Bogota')).toBe(false);
    expect(mismaAreaMetropolitana('Girardot', 'Bogota')).toBe(false);
  });
});
