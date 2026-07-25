/**
 * Estimacion del Subsidio Familiar de Vivienda (SFV). Capa: domain compartido
 * (puro, sin I/O).
 *
 * VIVE EN `shared/` Y NO EN UNA FEATURE porque lo consumen dos: F2.2 lo usa
 * para el plan de nutricion y F2.1 para el `subsidioEstimado` de la ficha del
 * closer. Duplicar la tabla en cada una era garantizar que se desincronizaran
 * (regla 4: una feature no importa internals de otra).
 *
 * GLASS-BOX + LEGAL: esto es un ESTIMADO determinista, nunca una aprobacion.
 * El SFV lo otorga la caja a hogares con ingresos <= 4 SMMLV; aqui solo
 * calculamos una banda con el rango salarial DECLARADO por el usuario. No se
 * consulta ninguna central de riesgo (Ley 1266 de 2008, fuera de alcance).
 *
 * La tabla de montos esta documentada y versionada a mano para que sea
 * auditable y recalibrable: son multiplos de SMMLV alineados con el esquema
 * historico de "Mi Casa Ya" (30 SMMLV para <= 2 SMMLV, 20 SMMLV para 2-4).
 * Si data/analisis confirma otras cifras, se cambian AQUI y en un solo lugar.
 */

import type { COP, LeadProfile } from '@contracts';
import { SMMLV_2026, TOPE_SFV_SMMLV } from '@contracts';

export interface SubsidyEstimate {
  /** Monto estimado en pesos enteros. `0` cuando el hogar no aplica. */
  monto: COP;
  /** `true` si el hogar aspira al SFV. */
  aplica: boolean;
  /**
   * Por que aplica o por que no, en una linea, para que la ficha pueda
   * MOSTRAR el motivo en vez de un numero sin origen. Es el requisito de
   * glass-box: un monto sin explicacion es indistinguible de un invento.
   */
  motivo: string;
}

/**
 * Techo de ingresos (en SMMLV) por etiqueta del vocabulario declarado.
 * `null` = tramo abierto (`>10 SMMLV`), que nunca aplica al SFV.
 */
const TECHO_SMMLV_POR_ETIQUETA: Readonly<Record<string, number | null>> = {
  '0-2 SMMLV': 2,
  '2-4 SMMLV': 4,
  '4-6 SMMLV': 6,
  '6-10 SMMLV': 10,
  '>10 SMMLV': null,
};

/** Monto del subsidio en SMMLV segun el techo de ingresos del hogar. */
function subsidioEnSmmlv(techoSmmlv: number | null): number {
  if (techoSmmlv === null) return 0;
  if (techoSmmlv <= 2) return 30;
  if (techoSmmlv <= TOPE_SFV_SMMLV) return 20;
  return 0;
}

/**
 * Estima el SFV a partir del rango salarial declarado. Determinista: mismas
 * entradas, misma salida. Sin rango conocido no se puede estimar -> no aplica.
 *
 * `tieneVivienda` es un GATE, no un peso: el SFV es para PRIMERA vivienda, asi
 * que un titular que ya es propietario no aspira por mucho que su ingreso
 * califique. El contrato ya lo declaraba en `LeadProfile.tieneVivienda`; aqui
 * se hace cumplir.
 */
export function estimateSubsidy(profile: LeadProfile): SubsidyEstimate {
  if (profile.tieneVivienda === true) {
    return {
      monto: 0,
      aplica: false,
      motivo: 'Ya es propietario: el SFV es para primera vivienda.',
    };
  }

  const etiqueta = profile.rangoSalarial;
  if (etiqueta === null || !(etiqueta in TECHO_SMMLV_POR_ETIQUETA)) {
    return {
      monto: 0,
      aplica: false,
      motivo: 'Sin rango salarial declarado no se puede estimar.',
    };
  }

  const techoSmmlv = TECHO_SMMLV_POR_ETIQUETA[etiqueta] ?? null;
  const smmlv = subsidioEnSmmlv(techoSmmlv);
  if (smmlv === 0) {
    return {
      monto: 0,
      aplica: false,
      motivo: `Ingresos declarados (${etiqueta}) por encima del tope de ${String(TOPE_SFV_SMMLV)} SMMLV.`,
    };
  }

  return {
    monto: smmlv * SMMLV_2026,
    aplica: true,
    motivo: `${String(smmlv)} SMMLV por ingresos declarados de ${etiqueta}.`,
  };
}
