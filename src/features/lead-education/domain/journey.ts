/**
 * Journey gamificado "Camino a Mi Hogar". Capa: domain (puro).
 *
 * GLASS-BOX: construir el journey, mover el progreso y decidir la readmision a
 * `viable` son funciones DETERMINISTAS y explicables. El LLM no participa: las
 * metas, sus puntos y el umbral de readmision son reglas, no una caja negra.
 *
 * Los ids de metas y badges son SEMANTICOS y estables (`meta-ahorro`,
 * `badge-ahorrador`): asi el frontend puede emitir un `ProgressEvent` contra un
 * `metaId` conocido sin tener que leerlos de vuelta primero.
 */

import type {
  Badge,
  EducationJourney,
  EtapaId,
  IsoDateTime,
  LeadProfile,
  Meta,
  NurturePlan,
  ProgressEvent,
  RoutingDecision,
} from '@contracts';
import { ETAPAS_CAMINO } from '@contracts';

export interface BuildJourneyInput {
  profile: LeadProfile;
  routing: RoutingDecision;
  plan: NurturePlan;
  now: IsoDateTime;
}

/** Metadatos de los badges desbloqueables, indexados por su id semantico. */
const BADGES: Readonly<Record<string, Omit<Badge, 'desbloqueadoEn'>>> = {
  'badge-ahorrador': {
    id: 'badge-ahorrador',
    nombre: 'Ahorrador',
    descripcion: 'Cerraste la brecha de ahorro hacia tu meta',
    icono: 'piggy-bank',
  },
  'badge-afiliado': {
    id: 'badge-afiliado',
    nombre: 'Afiliado',
    descripcion: 'Iniciaste tu afiliación a la caja',
    icono: 'id-card',
  },
  'badge-preparado': {
    id: 'badge-preparado',
    nombre: 'Preparado',
    descripcion: 'Reuniste los documentos para comprar',
    icono: 'file-text',
  },
};

/**
 * Construye el journey inicial a partir del lead no viable, su razon de ingreso
 * y el plan de nutricion. Todo el progreso arranca en cero.
 */
export function buildGamifiedJourney(input: BuildJourneyInput): EducationJourney {
  const { profile, routing, plan, now } = input;
  const necesitaAfiliacion =
    routing.razones.includes('no_afiliado_sin_cupo') || profile.esAfiliado === false;

  const metas: Meta[] = [];

  if (plan.gap > 0) {
    metas.push({
      id: 'meta-ahorro',
      titulo: 'Cerrá tu brecha de ahorro',
      descripcion: 'Registrá tus aportes hasta alcanzar la meta de ahorro.',
      tipo: 'ahorro',
      objetivo: plan.gap,
      alcanzado: 0,
      completada: false,
      puntos: 100,
      badgeId: 'badge-ahorrador',
      etapa: 'capacidad',
    });
  }

  if (necesitaAfiliacion) {
    metas.push({
      id: 'meta-afiliacion',
      titulo: 'Iniciá tu afiliación',
      descripcion: 'Afiliarte a la caja abre el subsidio y el crédito social.',
      tipo: 'afiliacion',
      objetivo: 1,
      alcanzado: 0,
      completada: false,
      puntos: 80,
      badgeId: 'badge-afiliado',
      etapa: 'descubrir',
    });
  }

  // Currículo adaptativo: si la razon de ingreso no involucra ahorro/capacidad
  // (el lead ya demostro que entiende su plata — entro por otro motivo, p. ej.
  // no estar afiliado), la leccion de capacidad se marca opcional en vez de
  // forzarla. No cuenta para `checkReadmission`/`progreso`.
  const capacidadEsOpcional =
    !routing.razones.includes('ahorro_insuficiente') && !routing.razones.includes('sin_capacidad');

  metas.push(
    metaEducativa('meta-edu-descubrir', 'Descubrí si podés comprar', 'descubrir'),
    metaEducativa(
      'meta-edu-capacidad',
      'Entendé tu capacidad financiera',
      'capacidad',
      capacidadEsOpcional,
    ),
    metaEducativa('meta-edu-financiar', 'Entendé cómo financiar tu vivienda', 'financiar'),
    {
      id: 'meta-doc',
      titulo: 'Reuní tus documentos',
      descripcion: 'Tené listo lo que te van a pedir para comprar.',
      tipo: 'documentacion',
      objetivo: 1,
      alcanzado: 0,
      completada: false,
      puntos: 50,
      badgeId: 'badge-preparado',
      etapa: 'prepararse',
    },
    metaEducativa('meta-edu-llegar', 'Preparate para hablar con un asesor', 'llegar'),
  );

  const badges: Badge[] = [];
  for (const meta of metas) {
    if (meta.badgeId === null) continue;
    const plantilla = BADGES[meta.badgeId];
    if (plantilla === undefined) continue;
    badges.push({ ...plantilla, desbloqueadoEn: null });
  }

  return {
    leadId: profile.id,
    plan,
    metas,
    progreso: 0,
    puntosTotales: 0,
    badges,
    reclasificadoAViable: false,
    razonesIngreso: routing.razones,
    etapas: [...ETAPAS_CAMINO],
    actualizadoEn: now,
  };
}

/** Meta booleana de "consumí el contenido de esta etapa". */
function metaEducativa(id: string, titulo: string, etapa: EtapaId, opcional = false): Meta {
  return {
    id,
    titulo,
    descripcion: 'Aprendé lo clave de esta etapa en pocos minutos.',
    tipo: 'educacion',
    objetivo: 1,
    alcanzado: 0,
    completada: false,
    puntos: 30,
    badgeId: null,
    etapa,
    ...(opcional ? { opcional: true } : {}),
  };
}

/**
 * Aplica un `ProgressEvent` al journey y devuelve una copia nueva (inmutable).
 * Las metas de ahorro ACUMULAN el valor; las booleanas se completan cuando el
 * evento trae valor >= 1. Recalcula puntos, badges, progreso y readmision.
 *
 * `aporteId` lo mintea el caso de uso via `IdGeneratorPort` (mismo patron que
 * `buildBotMessage` en F1): el dominio nunca genera ids, solo los recibe ya
 * calculados. Solo se usa cuando el evento realmente agrega un `AporteAhorro`.
 */
export function trackProgress(
  journey: EducationJourney,
  event: ProgressEvent,
  now: IsoDateTime,
  aporteId: string,
): EducationJourney {
  const metas = journey.metas.map((meta) => {
    if (meta.id !== event.metaId) return meta;
    const eraCompletada = meta.completada;
    const incremento =
      meta.tipo === 'ahorro' ? meta.alcanzado + event.valor : Math.max(meta.alcanzado, event.valor);
    const alcanzado = Math.min(meta.objetivo, incremento);
    const completada = alcanzado >= meta.objetivo;
    // Fecha real de la PRIMERA vez que se completa: si ya estaba completa (p.
    // ej. un segundo aporte tras alcanzar la meta), se preserva la fecha
    // original en vez de pisarla con `now`.
    const completadaEn = !eraCompletada && completada ? now : meta.completadaEn;

    // Historial de abonos: PARALELO a `alcanzado`, nunca lo reemplaza. Solo se
    // agrega un `AporteAhorro` cuando el evento es un abono real
    // (`ahorro_registrado`) con `valor > 0` — un valor 0 no es un aporte, es p.
    // ej. una request que solo configura `fechaObjetivo` (ver
    // `configureFechaObjetivo`) y no deberia ensuciar el historial con entradas
    // de $0.
    const aportes =
      meta.tipo === 'ahorro' && event.tipo === 'ahorro_registrado' && event.valor > 0
        ? [...(meta.aportes ?? []), { id: aporteId, monto: event.valor, ocurridoEn: now }]
        : meta.aportes;

    // `exactOptionalPropertyTypes`: solo se incluye la clave cuando hay un
    // valor real, para no asignar `aportes: undefined` a una `Meta` que nunca
    // tuvo la propiedad.
    return {
      ...meta,
      alcanzado,
      completada,
      ...(aportes !== undefined ? { aportes } : {}),
      ...(completadaEn !== undefined ? { completadaEn } : {}),
    };
  });

  const badges = journey.badges.map((badge) => {
    const metaDelBadge = metas.find((meta) => meta.badgeId === badge.id);
    if (metaDelBadge?.completada === true && badge.desbloqueadoEn === null) {
      return { ...badge, desbloqueadoEn: now };
    }
    return badge;
  });

  const completadas = metas.filter((meta) => meta.completada);
  // Las metas opcionales no cuentan ni a favor ni en contra: si el lead no las
  // necesita, no deberian dejarlo pegado en un 83% para siempre. `progreso` es
  // el numero que el usuario ve en todas las pantallas
  // (Inicio/Progreso/Perfil), asi que se recalcula ACA, no solo en
  // `checkReadmission` — una sola fuente de verdad.
  const metasQueCuentan = metas.filter((meta) => meta.opcional !== true);
  const completadasQueCuentan = metasQueCuentan.filter((meta) => meta.completada);
  const progreso =
    metasQueCuentan.length === 0 ? 0 : completadasQueCuentan.length / metasQueCuentan.length;
  const puntosTotales = completadas.reduce((suma, meta) => suma + meta.puntos, 0);

  const actualizado: EducationJourney = {
    ...journey,
    metas,
    badges,
    progreso,
    puntosTotales,
    actualizadoEn: now,
  };
  return { ...actualizado, reclasificadoAViable: checkReadmission(actualizado) };
}

/**
 * Decide si el lead ya puede volver a `viable`. Regla dura y explicable: se
 * readmite cuando TODAS las metas del recorrido estan completas — las
 * financieras (ahorro, afiliacion) Y las educativas (una por etapa) y de
 * documentacion.
 *
 * ANTES esta funcion readmitia con solo cerrar ahorro/afiliacion, ignorando el
 * resto del curriculo: un lead que registrara un aporte grande de una sola vez
 * se "graduaba" a F2.1 al instante, sin pasar por ninguna leccion — el punto
 * entero de F2.2 es nutrir CON educacion, no solo trackear un numero.
 * `journey.progreso` ya es la proporcion de las metas que CUENTAN (excluye las
 * `opcional: true`) completadas, asi que exigir `>= 1` cubre financiero +
 * educativo + documentacion en una sola condicion, sin necesitar el atajo de
 * "metas criticas" que habia antes.
 */
export function checkReadmission(journey: EducationJourney): boolean {
  return journey.progreso >= 1;
}

/**
 * Configura (o cambia) la fecha objetivo de UNA meta, sin tocar `alcanzado`,
 * `completada` ni `aportes`. Es una actualizacion de configuracion pura,
 * separada a proposito de `trackProgress`: elegir una fecha limite no es
 * "progreso" y no deberia poder disparar badges, puntos ni readmision.
 */
export function configureFechaObjetivo(
  journey: EducationJourney,
  metaId: string,
  fechaObjetivo: IsoDateTime,
  now: IsoDateTime,
): EducationJourney {
  const metas = journey.metas.map((meta) =>
    meta.id === metaId ? { ...meta, fechaObjetivo } : meta,
  );
  return { ...journey, metas, actualizadoEn: now };
}
