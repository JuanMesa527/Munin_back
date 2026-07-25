/**
 * Normalizacion de texto compartida entre `coverage.ts` y `compliance.ts`.
 * Capa: domain (funciones puras, sin dependencias).
 */

/** Minusculas y sin tildes: "así podés" -> "asi podes". Robusto a como hable el closer. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase();
}

/** Palabras cortas o de relleno: no distinguen un talking point de otro. */
const PALABRAS_VACIAS = new Set([
  'para',
  'esta',
  'estan',
  'este',
  'esta',
  'esto',
  'como',
  'pero',
  'porque',
  'usted',
  'ustedes',
  'nunca',
  'solo',
  'tiene',
  'tienes',
  'tener',
  'sobre',
  'hacia',
  'desde',
  'entre',
  'sera',
  'seria',
]);

const LARGO_MINIMO_PALABRA = 4;

/** Palabras significativas de un texto: en minuscula, sin tildes, sin relleno. */
export function palabrasSignificativas(texto: string): Set<string> {
  const palabras = normalizar(texto)
    .split(/[^a-z0-9]+/u)
    .filter((palabra) => palabra.length >= LARGO_MINIMO_PALABRA && !PALABRAS_VACIAS.has(palabra));
  return new Set(palabras);
}
