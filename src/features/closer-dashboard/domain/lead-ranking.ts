import type {
  EnrichedLead,
  LeadListFilters,
  LeadListPage,
  LeadListSort,
  ViableLeadListItem,
} from '@contracts';

function vieneDeNutricion(lead: EnrichedLead): boolean {
  return lead.timeline.some((event) => event.hito === 'nutricion');
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareRecenciaYLeadId(left: ViableLeadListItem, right: ViableLeadListItem): number {
  return (
    compareText(right.actualizadoEn, left.actualizadoEn) || compareText(left.leadId, right.leadId)
  );
}

function compareBySort(
  left: ViableLeadListItem,
  right: ViableLeadListItem,
  sort: LeadListSort,
): number {
  let primary = 0;

  switch (sort) {
    case 'score_desc':
      primary = right.score - left.score;
      break;
    case 'capacidad_desc':
      primary =
        (right.capacidadEstimada ?? Number.NEGATIVE_INFINITY) -
        (left.capacidadEstimada ?? Number.NEGATIVE_INFINITY);
      break;
    case 'intent_desc':
      primary = right.intentScore - left.intentScore;
      break;
    case 'recencia_desc':
      break;
  }

  return primary || compareRecenciaYLeadId(left, right);
}

function cumpleFiltros(item: ViableLeadListItem, filters: LeadListFilters): boolean {
  if (filters.soloAfiliados !== null && item.esAfiliado !== filters.soloAfiliados) {
    return false;
  }
  if (filters.soloNutridos !== null && item.vieneDeNutricion !== filters.soloNutridos) {
    return false;
  }
  if (filters.segmento !== null && item.segmento !== filters.segmento) return false;
  if (filters.ciudad !== null && item.ciudad !== filters.ciudad) return false;
  if (filters.scoreMinimo !== null && item.score < filters.scoreMinimo) return false;
  if (filters.banda !== null && item.banda !== filters.banda) return false;

  // `busqueda` puede contener PII y se aplica localmente para no llevarla a URL ni logs.
  return true;
}

export function toViableLeadListItem(lead: EnrichedLead): ViableLeadListItem {
  const topFactores = [...(lead.score?.factores ?? [])]
    .sort(
      (left, right) =>
        right.contribucion - left.contribucion || compareText(left.nombre, right.nombre),
    )
    .slice(0, 3);
  const proyectoTop =
    [...lead.proyectos].sort(
      (left, right) =>
        right.similitud - left.similitud || compareText(left.proyectoId, right.proyectoId),
    )[0] ?? null;

  return {
    leadId: lead.id,
    nombre: lead.identidad?.nombre ?? 'Lead sin nombre',
    esAfiliado: lead.esAfiliado === true,
    segmento: lead.segmento,
    ciudad: lead.ciudad,
    score: lead.score?.valor ?? 0,
    intentScore: lead.intentScore,
    banda: lead.capacidad?.banda ?? null,
    topFactores,
    vieneDeNutricion: vieneDeNutricion(lead),
    actualizadoEn: lead.updatedAt,
    edad: lead.edad,
    ocupacion: lead.ocupacion,
    capacidadEstimada: lead.capacidad?.precioMaximoEstimado ?? null,
    cuotaEstimada: lead.capacidad?.cuotaMensualEstimada ?? null,
    proyectoTop,
  };
}

export function rankAndPageViableLeads(
  leads: readonly EnrichedLead[],
  filters: LeadListFilters,
  sort: LeadListSort,
  pagina: number,
  porPagina: number,
  /**
   * Leads que entraron al perfilador, en cualquier carril. Entra COMO PARAMETRO
   * y no se deriva de `leads` porque aqui solo llegan los enriquecidos: los
   * no viables y los sin clasificar no estan en esta lista, y son justamente
   * el ruido que el contador presume haber filtrado. Solo el repositorio puede
   * contarlos.
   *
   * Sin valor cae a los viables encontrados, que es lo unico verdadero que se
   * puede afirmar con la informacion disponible: la reduccion se lee como
   * "N de N" (ninguna) en vez de inventar un denominador mayor.
   */
  totalIngresados?: number,
): LeadListPage {
  const ranked = leads
    .filter((lead) => lead.carril === 'viable')
    .map(toViableLeadListItem)
    .filter((item) => cumpleFiltros(item, filters))
    .sort((left, right) => compareBySort(left, right, sort));
  const inicio = (pagina - 1) * porPagina;

  return {
    items: ranked.slice(inicio, inicio + porPagina),
    total: ranked.length,
    totalIngresados: totalIngresados ?? ranked.length,
    pagina,
    porPagina,
  };
}
