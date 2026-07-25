/**
 * Plan de nutricion basado en el SFV. Capa: domain (puro).
 *
 * Formulas (adenda A11 — corrige el brief original):
 *   cuotaInicialObjetivo = precioObjetivo * PORCENTAJE_CUOTA_INICIAL
 *   gap   = cuotaInicialObjetivo - ahorroDeclarado - subsidioEstimado   (nunca < 0)
 *   meses = ceil(gap / capacidadAhorroMensual)
 *
 * ANTES `gap` se media contra el precio COMPLETO de la vivienda: nadie
 * necesita ahorrar el 100% del precio antes de arrancar tramites, el credito
 * hipotecario cubre el resto (VIS admite hasta 80% LTV en Colombia). La meta
 * real y accionable es la cuota inicial — que es ademas lo que ya ensenan las
 * lecciones de esta misma etapa.
 *
 * Determinista y explicable. Devuelve `Result` porque un lead sin ahorro o sin
 * capacidad declarada no se puede planear: eso es un error de datos esperado,
 * no un crash.
 */

import type { LeadProfile, NurturePlan, ProjectProfile } from '@contracts';
import { ValidationError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';
import { estimateSubsidy } from './subsidy.js';

/**
 * 30%: el estandar mas citado para credito hipotecario en Colombia (bancos
 * financian tipicamente hasta 70% LTV). Algunas lineas VIS puntuales bajan al
 * 20%, pero no es la norma general — y el proyecto prefiere sobreestimar lo
 * que falta antes que subestimarlo (regla de "nunca prometer de mas"). Es el
 * techo del rango 20-30% que ya ensena la leccion `cont-capacidad-cuota-inicial`.
 */
export const PORCENTAJE_CUOTA_INICIAL = 0.3;

/**
 * Construye el plan de nutricion hacia un proyecto objetivo. El proyecto lo
 * elige el caso de uso desde el `DataCatalogPort`; aqui solo se usa su precio
 * de entrada (`precioDesde`) como meta alcanzable.
 */
export function computeNurturePlan(
  profile: LeadProfile,
  proyecto: ProjectProfile,
): Result<NurturePlan> {
  const ahorro = profile.ahorroDeclarado;
  const capacidad = profile.capacidadAhorroMensual;

  if (ahorro === null) {
    return err(
      new ValidationError('Falta el ahorro declarado para calcular el plan', {
        ahorroDeclarado: 'requerido',
      }),
    );
  }
  if (capacidad === null || capacidad <= 0) {
    return err(
      new ValidationError('Falta la capacidad de ahorro mensual para calcular los meses', {
        capacidadAhorroMensual: 'requerida y mayor que cero',
      }),
    );
  }

  const subsidio = estimateSubsidy(profile);
  const precioObjetivo = proyecto.precioDesde;
  const cuotaInicialObjetivo = Math.round(precioObjetivo * PORCENTAJE_CUOTA_INICIAL);

  // gap acotado a >= 0: si el hogar ya cubre la cuota inicial, no hay brecha.
  const gap = Math.max(0, cuotaInicialObjetivo - ahorro - subsidio.monto);
  const mesesParaCalificar = gap === 0 ? 0 : Math.ceil(gap / capacidad);

  return ok({
    precioObjetivo,
    subsidioEstimado: subsidio.monto,
    cuotaInicialObjetivo,
    gap,
    mesesParaCalificar,
    proyectoObjetivoId: proyecto.proyectoId,
    aplicaSubsidio: subsidio.aplica,
  });
}
