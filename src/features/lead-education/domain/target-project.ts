/**
 * Eleccion del proyecto objetivo del plan de nutricion. Capa: domain (puro).
 *
 * Regla determinista y explicable: entre los proyectos del catalogo se elige el
 * MAS ALCANZABLE (menor `precioDesde`) que ademas encaje con la ciudad del lead
 * si la declaro. Nada de "el modelo eligio": es una comparacion ordenable que
 * se puede defender ante el jurado.
 */

import type { LeadProfile, ProjectProfile } from '@contracts';

/**
 * Proyecto de respaldo para cuando el pipeline de `analysis/` todavia no corrio
 * y el catalogo responde `DataUnavailableError`. Preferimos una demo que camina
 * a una pantalla en 503.
 *
 * Precio de referencia VIS (~90 SMMLV). Marcado explicitamente como referencia
 * para que nadie lo confunda con un proyecto real de Colsubsidio.
 */
export const PROYECTO_POR_DEFECTO: ProjectProfile = {
  proyectoId: 'vis-referencia',
  nombre: 'Proyecto VIS de referencia',
  ciudad: 'Bogotá',
  zona: 'otra',
  precioDesde: 146_115_000,
  precioHasta: 175_000_000,
  esVIS: true,
  perfilComprador: {},
  // Es un proyecto de referencia inventado: no tiene compradores de los que
  // derivar un perfil, y por lo tanto nada que se pueda citar como estadistica.
  perfilCalibrado: false,
  proporcionAfiliados: 0.9,
};

/**
 * Elige el proyecto objetivo. Prioriza los de la ciudad del lead; dentro del
 * grupo elegido, el de menor precio de entrada. Con lista vacia devuelve el
 * proyecto de respaldo.
 */
export function elegirProyectoObjetivo(
  profile: LeadProfile,
  proyectos: readonly ProjectProfile[],
): ProjectProfile {
  if (proyectos.length === 0) {
    return PROYECTO_POR_DEFECTO;
  }

  const ciudad = profile.ciudad;
  const mismaCiudad =
    ciudad === null
      ? []
      : proyectos.filter((p) => p.ciudad.toLowerCase() === ciudad.toLowerCase());
  const candidatos = mismaCiudad.length > 0 ? mismaCiudad : proyectos;

  return candidatos.reduce((masBarato, actual) =>
    actual.precioDesde < masBarato.precioDesde ? actual : masBarato,
  );
}
