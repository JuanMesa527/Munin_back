/**
 * Filtrado de elegibilidad y matching de proyectos de F1 (lead-intake).
 * Capa: domain (puro). Nunca recibe `LlmPort` — el "porque" es compuesto de
 * datos deterministas del catalogo calibrado, no generado libremente.
 */

import type { CapacityBand, LeadProfile, ProjectMatch, ProjectProfile } from '@contracts';

/**
 * Proporcion de compradores afiliados a partir de la cual un proyecto se
 * considera practicamente exclusivo de afiliados: por debajo de este umbral
 * queda margen suficiente para el 10% no-afiliado de la regla 90/10
 * (design.md D5). Placeholder documentado, como el resto de constantes de
 * calibracion de este feature.
 */
const UMBRAL_PROPORCION_AFILIADOS_SIN_MARGEN = 0.95;

/**
 * Descarta proyectos fuera de presupuesto, fuera de la ciudad declarada (si
 * hay una) o sin margen razonable dentro de la regla 90/10 para un lead
 * no-afiliado. Sin `capacidad.precioMaximoEstimado` no hay como evaluar
 * presupuesto, asi que no hay elegibles (datos insuficientes, nunca se inventa).
 */
export function filterByEligibility(
  proyectos: readonly ProjectProfile[],
  profile: LeadProfile,
  capacidad: CapacityBand,
): ProjectProfile[] {
  if (capacidad.precioMaximoEstimado === null) {
    return [];
  }
  const precioMaximo = capacidad.precioMaximoEstimado;

  return proyectos.filter((proyecto) => {
    if (proyecto.precioDesde > precioMaximo) {
      return false;
    }
    if (profile.ciudad !== null && proyecto.ciudad.toLowerCase() !== profile.ciudad.toLowerCase()) {
      return false;
    }
    if (profile.esAfiliado === false && proyecto.proporcionAfiliados >= UMBRAL_PROPORCION_AFILIADOS_SIN_MARGEN) {
      return false;
    }
    return true;
  });
}

/** Atributos del `LeadProfile` que se cruzan contra `ProjectProfile.perfilComprador`. */
const ATRIBUTOS_PERFIL: Record<string, (profile: LeadProfile) => string | null> = {
  segmento: (profile) => profile.segmento,
  ciudad: (profile) => profile.ciudad,
  segmentoFamiliar: (profile) => profile.segmentoFamiliar,
};

interface Coincidencia {
  readonly atributo: string;
  readonly valor: string;
  readonly proporcion: number;
}

function calcularCoincidencias(proyecto: ProjectProfile, profile: LeadProfile): Coincidencia[] {
  const coincidencias: Coincidencia[] = [];
  for (const [atributo, extraerValor] of Object.entries(ATRIBUTOS_PERFIL)) {
    const valorLead = extraerValor(profile);
    if (valorLead === null) {
      continue;
    }
    const distribucion = proyecto.perfilComprador[atributo];
    if (distribucion === undefined) {
      continue;
    }
    const proporcion = distribucion[valorLead];
    if (proporcion === undefined) {
      continue;
    }
    coincidencias.push({ atributo, valor: valorLead, proporcion });
  }
  return coincidencias;
}

function calcularSimilitud(proyecto: ProjectProfile, profile: LeadProfile): number {
  const coincidencias = calcularCoincidencias(proyecto, profile);
  if (coincidencias.length === 0) {
    return 0;
  }
  const suma = coincidencias.reduce((acumulado, coincidencia) => acumulado + coincidencia.proporcion, 0);
  return suma / coincidencias.length;
}

/**
 * Compone la razon en lenguaje natural a partir de datos deterministas del
 * buyer persona real del proyecto (`perfilComprador`) — nunca generacion
 * libre. Cuando no hay ninguna coincidencia de perfil, la razon cae a los
 * hechos de elegibilidad ya establecidos (precio/ciudad), pero SIEMPRE queda
 * fundamentada, nunca vacia ni un placeholder (spec "Every Match Has a Reason").
 */
export function explainMatch(
  proyecto: ProjectProfile,
  profile: LeadProfile,
): { razon: string; hechos: Record<string, string> } {
  const coincidencias = calcularCoincidencias(proyecto, profile);

  if (coincidencias.length > 0) {
    const mejor = coincidencias.reduce((max, actual) => (actual.proporcion > max.proporcion ? actual : max));
    const porcentaje = String(Math.round(mejor.proporcion * 100));
    const hechos: Record<string, string> = {};
    for (const coincidencia of coincidencias) {
      hechos[coincidencia.atributo] = `${String(Math.round(coincidencia.proporcion * 100))}%`;
    }
    return {
      razon: `El ${porcentaje}% de compradores de ${proyecto.nombre} comparten tu ${mejor.atributo} (${mejor.valor}).`,
      hechos,
    };
  }

  return {
    razon: `${proyecto.nombre} está dentro de tu rango de precio estimado en ${proyecto.ciudad}.`,
    hechos: { ciudad: proyecto.ciudad, precioDesde: String(proyecto.precioDesde) },
  };
}

/**
 * Rankea proyectos elegibles por similitud contra el buyer persona real.
 * Recibe SOLO `elegibles` (ya filtrados por `filterByEligibility`): esta
 * funcion no vuelve a evaluar presupuesto/ciudad/cupo, solo ordena afinidad.
 */
export function matchProjects(
  elegibles: readonly ProjectProfile[],
  profile: LeadProfile,
  limite = 3,
): ProjectMatch[] {
  return elegibles
    .map((proyecto) => ({
      proyectoId: proyecto.proyectoId,
      similitud: calcularSimilitud(proyecto, profile),
      razon: explainMatch(proyecto, profile).razon,
      nombre: proyecto.nombre,
      precioDesde: proyecto.precioDesde,
      // `ProjectProfile` (buyer-persona agregado) no trae `etapa` ni `tipologia`:
      // esos los resuelve el catalogo comercial (`ProjectCard`, adenda A8). Hasta
      // cablear ese cruce, se derivan del dato disponible y quedan documentados
      // como el resto de placeholders de calibracion de este feature.
      // TODO (A8): resolver etapa/tipologia reales desde `getProjectCard`.
      etapa: 'Única etapa',
      tipologia: proyecto.esVIS ? 'VIS' : 'No VIS',
    }))
    .sort((a, b) => b.similitud - a.similitud)
    .slice(0, limite);
}
