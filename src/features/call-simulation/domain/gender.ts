/**
 * Inferencia de genero a partir del nombre de pila. Capa: domain (pura).
 *
 * POR QUE ES UNA INFERENCIA Y NO UN DATO: ni el Excel de compradores ni
 * `LeadProfile` traen genero. Lo unico disponible es `identidad.nombre`, y aun
 * asi la voz TIENE que corresponder — una Laura con voz de hombre rompe la
 * simulacion en el primer segundo.
 *
 * ALCANCE DELIBERADAMENTE ESTRECHO: esto elige una VOZ en un entrenamiento
 * simulado. No escribe en `LeadProfile`, no viaja en ningun DTO y no toca el
 * scoring ni el carril. Un acierto mejora el roleplay; un fallo suena raro y
 * nada mas. Si algun dia se quisiera usar para otra cosa, hay que capturar el
 * dato de verdad en F1 y preguntarselo al titular — inferir un atributo
 * personal para decidir algo que le afecte al lead seria otra discusion.
 *
 * La heuristica del `-a` final acierta muy alto en espanol colombiano, pero
 * falla justo en nombres frecuentes (Nicolas y Matias son masculinos; Luz y
 * Beatriz, femeninos). Por eso primero se consultan dos listas y solo despues
 * se cae a la terminacion.
 */

export type GeneroInferido = 'femenino' | 'masculino';

/** Femeninos que NO terminan en `-a`, donde la heuristica fallaria. */
const FEMENINOS_EXCEPCION = new Set([
  'beatriz',
  'carmen',
  'consuelo',
  'dolores',
  'esperanza',
  'ines',
  'isabel',
  'judith',
  'lizeth',
  'lourdes',
  'luz',
  'mercedes',
  'milagros',
  'nohemi',
  'raquel',
  'rocio',
  'soledad',
  'yamile',
  'yaneth',
]);

/** Masculinos que SI terminan en `-a`, el otro lado del mismo error. */
const MASCULINOS_EXCEPCION = new Set([
  'elias',
  'jeremias',
  'jonas',
  'josua',
  'lucas',
  'matias',
  'nicolas',
  'tobias',
  'zacarias',
]);

/** Marcas diacriticas de Unicode: lo que deja `NFD` al separar las tildes. */
const DIACRITICOS = /[̀-ͯ]/gu;

/** `"Andrés"` -> `"andres"`. Sin esto las listas no coinciden nunca. */
function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(DIACRITICOS, '');
}

/**
 * Genero probable del PRIMER nombre. `masculino` es solo el desempate cuando
 * no hay nada en que apoyarse: no es una afirmacion sobre la persona.
 */
export function inferirGenero(nombre: string | null | undefined): GeneroInferido {
  const primero = normalizar((nombre ?? '').split(/\s+/u)[0] ?? '');
  if (primero.length === 0) return 'masculino';

  if (FEMENINOS_EXCEPCION.has(primero)) return 'femenino';
  if (MASCULINOS_EXCEPCION.has(primero)) return 'masculino';

  // `-ion` cubre Asuncion y Concepcion, que siguen siendo comunes en el pais.
  if (primero.endsWith('a') || primero.endsWith('ion')) return 'femenino';
  return 'masculino';
}
