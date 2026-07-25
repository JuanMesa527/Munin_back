/**
 * Filtrado de elegibilidad y matching de proyectos de F1 (lead-intake).
 * Capa: domain (puro). Nunca recibe `LlmPort` — el "porque" es compuesto de
 * datos deterministas del catalogo calibrado, no generado libremente.
 */

import type { CapacityBand, LeadProfile, ProjectMatch, ProjectProfile } from '@contracts';
import { mismaCiudad } from '@shared/domain/value-objects/city.js';

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
    // `mismaCiudad` y no `toLowerCase()`: el chat ofrece "Bogota" con tilde y el
    // catalogo la escribe sin ella, asi que la comparacion cruda descartaba los
    // 4 proyectos de Bogota para todo lead que hubiera usado el chip.
    if (profile.ciudad !== null && !mismaCiudad(proyecto.ciudad, profile.ciudad)) {
      return false;
    }
    if (
      profile.esAfiliado === false &&
      proyecto.proporcionAfiliados >= UMBRAL_PROPORCION_AFILIADOS_SIN_MARGEN
    ) {
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
  const suma = coincidencias.reduce(
    (acumulado, coincidencia) => acumulado + coincidencia.proporcion,
    0,
  );
  return suma / coincidencias.length;
}

/**
 * Compone la razon en lenguaje natural a partir de datos deterministas del
 * buyer persona real del proyecto (`perfilComprador`) — nunca generacion
 * libre. Cuando no hay ninguna coincidencia de perfil, la razon cae a los
 * hechos de elegibilidad ya establecidos (precio/ciudad), pero SIEMPRE queda
 * fundamentada, nunca vacia ni un placeholder (spec "Every Match Has a Reason").
 *
 * LA ESTADISTICA SOLO SE CITA SI ESTA CALIBRADA. "El 87% de compradores de X
 * comparten tu segmento" se lee como un hecho verificado sobre 4.142 personas
 * reales. Mientras `perfilCalibrado` sea `false` esas proporciones son una
 * heuristica escrita a mano, y publicarlas como porcentaje seria inventar una
 * estadistica sobre compradores que no existen — el fallo de confianza mas caro
 * que puede cometer un producto que se vende como glass-box. Sin calibrar se
 * dice lo que SI es cierto: el proyecto encaja en precio y ciudad.
 */
export function explainMatch(
  proyecto: ProjectProfile,
  profile: LeadProfile,
): { razon: string; hechos: Record<string, string> } {
  const coincidencias = calcularCoincidencias(proyecto, profile);

  if (proyecto.perfilCalibrado && coincidencias.length > 0) {
    const mejor = coincidencias.reduce((max, actual) =>
      actual.proporcion > max.proporcion ? actual : max,
    );
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
 * Que datos del lead le faltaron al cruce contra el buyer persona, ya legibles.
 * Es el detalle que acompana a `ProjectMatch.confianza`.
 */
function datosFaltantes(proyecto: ProjectProfile, profile: LeadProfile): string[] {
  const legible: Record<string, string> = {
    segmento: 'tu segmento',
    ciudad: 'tu ciudad',
    segmentoFamiliar: 'tu composicion familiar',
  };
  const cruzados = new Set(calcularCoincidencias(proyecto, profile).map((c) => c.atributo));
  return Object.keys(ATRIBUTOS_PERFIL)
    .filter((atributo) => !cruzados.has(atributo))
    .map((atributo) => legible[atributo] ?? atributo);
}

/**
 * Rankea proyectos elegibles por similitud contra el buyer persona real.
 * Recibe SOLO `elegibles` (ya filtrados por `filterByEligibility`): esta
 * funcion no vuelve a evaluar presupuesto/ciudad/cupo, solo ordena afinidad.
 *
 * `cabeEnCapacidad` es `true` sin volver a mirar el precio precisamente porque
 * `filterByEligibility` ya descarto todo lo que no cabe: repetir la condicion
 * aqui abriria la puerta a que las dos versiones se separen.
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
      cabeEnCapacidad: true,
      // Sin perfiles calibrados la similitud sale de distribuciones inventadas:
      // sirve para ordenar, no significa nada. Se declara `0` y no un valor
      // parcial porque no hay grados de "el dato no existe".
      confianza: proyecto.perfilCalibrado
        ? (3 - datosFaltantes(proyecto, profile).length) / 3
        : 0,
      datosFaltantes: proyecto.perfilCalibrado
        ? datosFaltantes(proyecto, profile)
        : ['el perfil real de compradores de este proyecto'],
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
