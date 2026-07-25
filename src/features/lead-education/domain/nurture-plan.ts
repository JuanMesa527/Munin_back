/**
 * Plan de nutricion basado en el SFV. Capa: domain (puro).
 *
 * Formulas del brief (EQUIPO.md, F2.2):
 *   gap   = precioObjetivo - ahorroDeclarado - subsidioEstimado   (nunca < 0)
 *   meses = ceil(gap / capacidadAhorroMensual)
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

  // gap acotado a >= 0: si el hogar ya cubre el objetivo, no hay brecha.
  const gap = Math.max(0, precioObjetivo - ahorro - subsidio.monto);
  const mesesParaCalificar = gap === 0 ? 0 : Math.ceil(gap / capacidad);

  return ok({
    precioObjetivo,
    subsidioEstimado: subsidio.monto,
    gap,
    mesesParaCalificar,
    proyectoObjetivoId: proyecto.proyectoId,
    aplicaSubsidio: subsidio.aplica,
  });
}
