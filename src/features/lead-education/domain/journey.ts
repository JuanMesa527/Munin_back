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

  metas.push(
    metaEducativa('meta-edu-descubrir', 'Descubrí si podés comprar', 'descubrir'),
    metaEducativa('meta-edu-capacidad', 'Entendé tu capacidad financiera', 'capacidad'),
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
function metaEducativa(id: string, titulo: string, etapa: EtapaId): Meta {
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
  };
}

/**
 * Aplica un `ProgressEvent` al journey y devuelve una copia nueva (inmutable).
 * Las metas de ahorro ACUMULAN el valor; las booleanas se completan cuando el
 * evento trae valor >= 1. Recalcula puntos, badges, progreso y readmision.
 */
export function trackProgress(
  journey: EducationJourney,
  event: ProgressEvent,
  now: IsoDateTime,
): EducationJourney {
  const metas = journey.metas.map((meta) => {
    if (meta.id !== event.metaId) return meta;
    const incremento =
      meta.tipo === 'ahorro' ? meta.alcanzado + event.valor : Math.max(meta.alcanzado, event.valor);
    const alcanzado = Math.min(meta.objetivo, incremento);
    return { ...meta, alcanzado, completada: alcanzado >= meta.objetivo };
  });

  const badges = journey.badges.map((badge) => {
    const metaDelBadge = metas.find((meta) => meta.badgeId === badge.id);
    if (metaDelBadge?.completada === true && badge.desbloqueadoEn === null) {
      return { ...badge, desbloqueadoEn: now };
    }
    return badge;
  });

  const completadas = metas.filter((meta) => meta.completada);
  const progreso = metas.length === 0 ? 0 : completadas.length / metas.length;
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
 * readmite cuando TODAS las metas criticas (ahorro y afiliacion) estan
 * completas. Si no hay metas criticas (ya afiliado y sin brecha), basta con
 * completar el recorrido.
 */
export function checkReadmission(journey: EducationJourney): boolean {
  const criticas = journey.metas.filter(
    (meta) => meta.tipo === 'ahorro' || meta.tipo === 'afiliacion',
  );
  if (criticas.length > 0) {
    return criticas.every((meta) => meta.completada);
  }
  return journey.progreso >= 1;
}
