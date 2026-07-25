/**
 * Ritmo de ahorro real de una meta `tipo: 'ahorro'`. Capa: domain (puro).
 *
 * `Meta.alcanzado` solo dice CUANTO lleva ahorrado el lead, no A QUE RITMO.
 * Esta funcion deriva el ritmo real de `Meta.aportes` para poder proyectar si,
 * al paso actual, el lead llega a su `fechaObjetivo` — sin esto, "fechaObjetivo"
 * seria solo un campo decorativo.
 */

import type { IsoDateTime, Meta, RitmoAhorro } from '@contracts';

/** Cuantos meses calendario (inclusive) hay entre dos ISO-8601 UTC. */
function mesesEntre(desde: IsoDateTime, hasta: IsoDateTime): number {
  const d = new Date(desde);
  const h = new Date(hasta);
  return (h.getUTCFullYear() - d.getUTCFullYear()) * 12 + (h.getUTCMonth() - d.getUTCMonth()) + 1;
}

/** Clave `YYYY-MM` (UTC) para agrupar aportes por mes calendario. */
function claveMes(fecha: IsoDateTime): string {
  const d = new Date(fecha);
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth()).padStart(2, '0')}`;
}

/** Suma `n` meses calendario (UTC) a una fecha ISO y devuelve otra ISO. */
function sumarMeses(fecha: IsoDateTime, n: number): IsoDateTime {
  const d = new Date(fecha);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString();
}

/**
 * Calcula el ritmo de ahorro de `meta` al instante `ahora`.
 *
 * Decisiones de diseno (documentadas porque no son obvias):
 *
 * - El promedio mensual se calcula sobre TODOS los meses calendario entre el
 *   primer aporte y `ahora`, incluidos los meses SIN aportes (cuentan como 0).
 *   Ahorrar en el mes 1 y en el mes 3 sin nada en el mes 2 promedia sobre 3
 *   meses, no sobre 2: un promedio que solo mira los meses "activos" premia la
 *   inconsistencia y le miente al lead sobre su ritmo real.
 * - Sin aportes todavia, no hay ritmo que calcular: `ritmoMensualPromedio: 0`,
 *   `mesesRestantesAlRitmoActual: null` (no se puede proyectar desde cero).
 *   Si ademas ya hay `fechaObjetivo`, `enRitmoParaFecha: false` — un lead que
 *   se puso fecha pero todavia no aporto NO esta en ritmo (la alternativa,
 *   `null`, se reserva para "no hay fecha con que comparar"; aca si la hay, y
 *   la respuesta honesta es que todavia no).
 * - `enRitmoParaFecha` compara la fecha PROYECTADA de cierre (ahora + meses
 *   restantes) contra `fechaObjetivo`: `true` si la proyeccion llega antes o
 *   justo en la fecha limite.
 */
export function computeRitmoAhorro(meta: Meta, ahora: IsoDateTime): RitmoAhorro {
  const aportes = meta.aportes ?? [];

  if (aportes.length === 0) {
    return {
      ritmoMensualPromedio: 0,
      mesesRestantesAlRitmoActual: null,
      enRitmoParaFecha: meta.fechaObjetivo !== undefined ? false : null,
    };
  }

  const ordenados = [...aportes].sort(
    (a, b) => new Date(a.ocurridoEn).getTime() - new Date(b.ocurridoEn).getTime(),
  );
  const primerAporte = ordenados[0]?.ocurridoEn ?? ahora;

  const totalesPorMes = new Map<string, number>();
  for (const aporte of aportes) {
    const clave = claveMes(aporte.ocurridoEn);
    totalesPorMes.set(clave, (totalesPorMes.get(clave) ?? 0) + aporte.monto);
  }

  // Meses calendario entre el primer aporte y ahora, TODOS (con o sin aporte).
  const totalMeses = Math.max(1, mesesEntre(primerAporte, ahora));
  const sumaAportes = aportes.reduce((suma, aporte) => suma + aporte.monto, 0);
  const ritmoMensualPromedio = sumaAportes / totalMeses;

  const faltante = meta.objetivo - meta.alcanzado;
  const mesesRestantesAlRitmoActual =
    ritmoMensualPromedio > 0 ? Math.ceil(faltante / ritmoMensualPromedio) : null;

  let enRitmoParaFecha: boolean | null = null;
  if (meta.fechaObjetivo !== undefined) {
    if (mesesRestantesAlRitmoActual === null) {
      enRitmoParaFecha = false;
    } else {
      const proyeccion = sumarMeses(ahora, mesesRestantesAlRitmoActual);
      enRitmoParaFecha = new Date(proyeccion).getTime() <= new Date(meta.fechaObjetivo).getTime();
    }
  }

  return { ritmoMensualPromedio, mesesRestantesAlRitmoActual, enRitmoParaFecha };
}
