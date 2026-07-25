/**
 * Afiliacion, capacidad y scoring de F1 (lead-intake). Capa: domain (puro).
 *
 * REGLA DURA (glass-box, EQUIPO.md regla 12/20): estas funciones son
 * DETERMINISTAS. Ninguna recibe `LlmPort` ni llama a un adapter de red. Sin
 * `estrato` en ningun lado — `FileDataCatalogAdapter` ya lo rechaza aguas
 * arriba, y aqui ademas nunca se referencia esa clave.
 */

import { SMMLV_2026 } from '@contracts';
import type {
  CapacityBand,
  COP,
  Factor,
  IsoDateTime,
  LeadProfile,
  ScoreResult,
  Slot,
  ScoringWeights,
} from '@contracts';
import { isSlotFilled } from '@shared/domain/lead.js';
import { toSmmlvBounds } from '@shared/domain/value-objects/salary-range.js';
import { DataUnavailableError, ValidationError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';

export interface AffiliationCheck {
  readonly esAfiliado: boolean;
  /** `true` cuando el lead es no-afiliado y por eso cae bajo el margen 90/10. */
  readonly aplicaCupo9010: boolean;
}

/**
 * Afiliacion es UN factor, nunca un gate (spec "Affiliation Is One Weighted
 * Factor, Not a Gate", design.md D5): esta funcion solo observa y clasifica,
 * no decide ni detiene la conversacion.
 */
export function checkAffiliation(profile: LeadProfile): AffiliationCheck {
  const esAfiliado = profile.esAfiliado === true;
  return { esAfiliado, aplicaCupo9010: !esAfiliado };
}

/* ---------------------------------------------------------------------- *
 *  estimateCapacity — constantes PLACEHOLDER hasta que analysis/ calibre.
 *  Documentadas explicitamente (design.md Open Questions) para que un
 *  revisor pueda apuntar a la linea y reemplazarlas cuando haya datos reales.
 * ---------------------------------------------------------------------- */

/** Cuota mensual sostenible <= 30% del ingreso mensual estimado. */
const MAX_CUOTA_INGRESO_RATIO = 0.3;

/** Horizonte tipico de un credito hipotecario en Colombia: 20 años. */
const HORIZONTE_CREDITO_MESES = 240;

/** Umbrales de banda, en pesos de cuota mensual estimada. */
const BANDA_ALTA_CUOTA_MINIMA: COP = 3_000_000;
const BANDA_MEDIA_CUOTA_MINIMA: COP = 1_200_000;

const SLOTS_RELEVANTES_CAPACIDAD: readonly Slot[] = [
  'rangoSalarial',
  'ahorro',
  'capacidadAhorroMensual',
];

/** Ingreso mensual estimado a partir del punto medio del rango salarial declarado. */
function estimarIngresoMensual(rangoSalarial: string): number | null {
  const cotas = toSmmlvBounds({ etiqueta: rangoSalarial });
  if (!cotas.ok) {
    return null;
  }
  // Tramo abierto (">10 SMMLV"): sin techo real, usamos 1.5x el piso como
  // referencia conservadora en vez de un promedio indefinido.
  const puntoMedioSmmlv =
    cotas.value.hasta === null
      ? cotas.value.desde * 1.5
      : (cotas.value.desde + cotas.value.hasta) / 2;
  return puntoMedioSmmlv * SMMLV_2026;
}

function estimarCuotaMensual(profile: LeadProfile): COP | null {
  if (profile.rangoSalarial !== null) {
    const ingreso = estimarIngresoMensual(profile.rangoSalarial);
    if (ingreso !== null) {
      return Math.round(ingreso * MAX_CUOTA_INGRESO_RATIO);
    }
  }
  // Sin rango salarial: la capacidad de ahorro mensual declarada es la mejor
  // aproximacion disponible a lo que el lead podria destinar a una cuota.
  return profile.capacidadAhorroMensual;
}

function estimarPrecioMaximo(profile: LeadProfile, cuotaMensualEstimada: COP | null): COP | null {
  if (profile.ahorroDeclarado === null && cuotaMensualEstimada === null) {
    return null;
  }
  const ahorro = profile.ahorroDeclarado ?? 0;
  const credito = (cuotaMensualEstimada ?? 0) * HORIZONTE_CREDITO_MESES;
  return ahorro + credito;
}

function clasificarBanda(cuotaMensualEstimada: COP | null): CapacityBand['banda'] {
  if (cuotaMensualEstimada === null) {
    return 'baja';
  }
  if (cuotaMensualEstimada >= BANDA_ALTA_CUOTA_MINIMA) {
    return 'alta';
  }
  if (cuotaMensualEstimada >= BANDA_MEDIA_CUOTA_MINIMA) {
    return 'media';
  }
  return 'baja';
}

/**
 * Estima una banda de capacidad SIN consultar ningun bureau de credito
 * (fuera de alcance, EQUIPO.md seccion 8). Todo COP se trata como entero ya
 * normalizado — nunca se multiplica/divide por 1000.
 */
export function estimateCapacity(profile: LeadProfile): Result<CapacityBand, ValidationError> {
  const hayDatos =
    profile.rangoSalarial !== null ||
    profile.ahorroDeclarado !== null ||
    profile.capacidadAhorroMensual !== null;
  if (!hayDatos) {
    return err(
      new ValidationError('No hay datos suficientes para estimar la capacidad', {
        capacidad: 'se requiere al menos rango salarial, ahorro o capacidad de ahorro mensual',
      }),
    );
  }

  const faltantes = SLOTS_RELEVANTES_CAPACIDAD.filter((slot) => !isSlotFilled(profile, slot));
  const cuotaMensualEstimada = estimarCuotaMensual(profile);
  const precioMaximoEstimado = estimarPrecioMaximo(profile, cuotaMensualEstimada);
  const banda = clasificarBanda(cuotaMensualEstimada);

  return ok({ banda, faltantes, cuotaMensualEstimada, precioMaximoEstimado });
}

/* ---------------------------------------------------------------------- *
 *  scoreLead — combinacion lineal simple sobre los pesos calibrados.
 * ---------------------------------------------------------------------- */

interface ValorObservado {
  readonly valorNormalizado: number;
  readonly valorLegible: string;
}

/** Referencias PLACEHOLDER de normalizacion, documentadas igual que arriba. */
const REFERENCIA_SMMLV_MAXIMA = 10;
const REFERENCIA_AHORRO: COP = 60_000_000;
const REFERENCIA_CAPACIDAD_MENSUAL: COP = 2_000_000;

const SEGMENTO_FAMILIAR_NORMALIZADO: Record<string, number> = {
  Unipersonal: 0.9,
  'Pareja sin hijos': 0.8,
  'Pareja con hijos': 0.6,
  Monoparental: 0.5,
  'Familia extensa': 0.4,
};

function normalizar01(valor: number, referencia: number): number {
  return Math.max(0, Math.min(valor / referencia, 1));
}

/**
 * Extractores de factores conocidos, keyeados por el mismo nombre que usaria
 * `data/weights.json`. Solo las claves presentes ACA pueden convertirse en un
 * `Factor` — por diseno, `estrato` nunca esta en este mapa (regla dura).
 */
const FACTOR_EXTRACTORS: Record<string, (profile: LeadProfile) => ValorObservado | null> = {
  afiliacion: (profile) => {
    if (profile.esAfiliado === null) {
      return null;
    }
    return {
      valorNormalizado: profile.esAfiliado ? 1 : 0,
      valorLegible: profile.esAfiliado ? 'Afiliado' : 'No afiliado',
    };
  },
  rangoSalarial: (profile) => {
    if (profile.rangoSalarial === null) {
      return null;
    }
    const cotas = toSmmlvBounds({ etiqueta: profile.rangoSalarial });
    if (!cotas.ok) {
      return null;
    }
    return {
      valorNormalizado: normalizar01(cotas.value.desde, REFERENCIA_SMMLV_MAXIMA),
      valorLegible: profile.rangoSalarial,
    };
  },
  ahorro: (profile) => {
    if (profile.ahorroDeclarado === null) {
      return null;
    }
    return {
      valorNormalizado: normalizar01(profile.ahorroDeclarado, REFERENCIA_AHORRO),
      valorLegible: `$${profile.ahorroDeclarado.toLocaleString('es-CO')}`,
    };
  },
  capacidadAhorroMensual: (profile) => {
    if (profile.capacidadAhorroMensual === null) {
      return null;
    }
    return {
      valorNormalizado: normalizar01(profile.capacidadAhorroMensual, REFERENCIA_CAPACIDAD_MENSUAL),
      valorLegible: `$${profile.capacidadAhorroMensual.toLocaleString('es-CO')}`,
    };
  },
  segmentoFamiliar: (profile) => {
    if (profile.segmentoFamiliar === null) {
      return null;
    }
    const valorNormalizado = SEGMENTO_FAMILIAR_NORMALIZADO[profile.segmentoFamiliar];
    if (valorNormalizado === undefined) {
      return null;
    }
    return { valorNormalizado, valorLegible: profile.segmentoFamiliar };
  },
};

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function clamp(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, maximo));
}

/**
 * Score determinista 0-100 calibrado contra `weights.json` (design.md,
 * spec lead-intake-profiling). NUNCA recibe `LlmPort`: el LLM no decide.
 * Si ningun peso calibrado tiene una contraparte observable en el perfil,
 * retorna `DataUnavailableError` en vez de un `ScoreResult` sin factores
 * (spec "Every Score Carries Explainable Factors").
 */
export function scoreLead(
  profile: LeadProfile,
  weights: ScoringWeights,
  now: IsoDateTime,
): Result<ScoreResult, DataUnavailableError> {
  const factores: Factor[] = [];

  for (const [nombre, peso] of Object.entries(weights.pesos)) {
    const extractor = FACTOR_EXTRACTORS[nombre];
    if (extractor === undefined) {
      continue;
    }
    const observado = extractor(profile);
    if (observado === null) {
      continue;
    }
    factores.push({
      nombre,
      peso,
      valor: observado.valorLegible,
      contribucion: redondear2(peso * observado.valorNormalizado),
      // Adenda A8: `intensidad` (0-100) es lo unico dibujable como barra —
      // que tan bien puntua el lead en ESTE factor, independiente del signo del
      // aporte. Es el `valorNormalizado` (0-1) llevado a escala 0-100.
      intensidad: Math.round(observado.valorNormalizado * 100),
    });
  }

  if (factores.length === 0) {
    return err(
      new DataUnavailableError('No hay suficientes datos del lead para calcular el score', {
        score: 'faltan factores observables',
      }),
    );
  }

  const bruto = factores.reduce((acumulado, factor) => acumulado + factor.contribucion, 0);
  const valor = clamp(Math.round(bruto * 100), 0, 100);

  return ok({ valor, factores, weightsVersion: weights.version, calculadoEn: now });
}

/** Top-N factores por impacto ABSOLUTO (los que mas suman Y los que mas restan). */
export function getTopFactors(score: ScoreResult, limite = 3): Factor[] {
  return [...score.factores]
    .sort((a, b) => Math.abs(b.contribucion) - Math.abs(a.contribucion))
    .slice(0, limite);
}
