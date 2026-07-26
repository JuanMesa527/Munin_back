/**
 * Normalizacion de nombres de ciudad. Capa: domain compartido (puro, sin I/O).
 *
 * POR QUE EXISTE: el chat ofrece "Bogota" con tilde y
 * `data/projects_catalog.json` la escribe sin tilde. Comparar con `toLowerCase`
 * a secas las hacia ciudades DISTINTAS, y eso rompia dos cosas:
 *
 *   - `filterByEligibility` (F1) descartaba los 4 proyectos de Bogota para
 *     cualquiera que hubiera elegido el chip con tilde -> ficha sin proyectos;
 *   - `aporteUbicacion` (F2.1) le daba 0.2 en ubicacion, el peor puntaje, asi
 *     que la baraja le mostraba sus PROPIOS proyectos de ultimos.
 *
 * Vive en `shared/` porque lo necesitan F1 y F2.1, y tener dos normalizaciones
 * distintas es como volver a tener el bug.
 */

/**
 * Marcas diacriticas, ya separadas de su letra por `NFD`.
 *
 * Se usa la propiedad Unicode `\p{Diacritic}` y no el rango de caracteres:
 * escrito literalmente, ese rango son caracteres INVISIBLES en el fuente, y un
 * editor o un merge pueden comerselos sin que nadie lo note.
 */
const MARCAS_DIACRITICAS = /\p{Diacritic}/gu;

/**
 * La tilde de la `ñ`. Se CONSERVA: en español la eñe es una letra propia, no
 * una `n` acentuada, y borrarla convierte "Cañasgordas" en "canasgordas". Es
 * el mismo caracter combinante que usa el portugues para `ã`, pero aqui el
 * dominio es Colombia.
 */
const TILDE_DE_ENE = '̃';

/**
 * Deja la ciudad comparable: sin espacios sobrantes, en minusculas y sin
 * diacriticos. Las tres escrituras de "Bogota" colapsan al mismo valor.
 *
 * Se quitan los diacriticos en vez de mapear ciudad por ciudad porque el dato
 * lo escriben tres fuentes distintas (chips del chat, texto libre del titular y
 * el pipeline de `analysis/`) y ninguna garantiza la misma ortografia. `NFD`
 * separa la letra del acento y el reemplazo borra el acento.
 */
export function normalizarCiudad(ciudad: string): string {
  return ciudad
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, (marca) => (marca === TILDE_DE_ENE ? marca : ''))
    // Recompone la `n` + tilde en `ñ`; sin esto quedaria descompuesta y dos
    // cadenas visualmente iguales no serian `===`.
    .normalize('NFC');
}

/** `true` si las dos ciudades son la misma, sin importar tildes ni mayusculas. */
export function mismaCiudad(ciudadA: string, ciudadB: string): boolean {
  return normalizarCiudad(ciudadA) === normalizarCiudad(ciudadB);
}

/**
 * Ciudades que son area de influencia de Bogota: para alguien de Bogota son una
 * alternativa real, no otra ciudad. Ya normalizadas.
 */
export const AREA_BOGOTA: readonly string[] = ['bogota', 'soacha', 'chia', 'tocancipa'];

/** `true` si ambas ciudades estan dentro del area de influencia de Bogota. */
export function mismaAreaMetropolitana(ciudadA: string, ciudadB: string): boolean {
  return (
    AREA_BOGOTA.includes(normalizarCiudad(ciudadA)) &&
    AREA_BOGOTA.includes(normalizarCiudad(ciudadB))
  );
}
