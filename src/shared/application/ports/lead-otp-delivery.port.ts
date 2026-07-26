/**
 * Puerto de ENVIO del OTP del lead (F2.2, adenda A14). Capa: application.
 *
 * Separado de `LeadOtpPort` (`lead-auth.port.ts`) a proposito: ese puerto
 * GENERA y VERIFICA el codigo; este solo lo ENTREGA por un canal real
 * (correo/SMS). El controller no sabe si el envio es mock o real, mismo
 * desacople que `LlmPort` con `llm.factory.ts`.
 */

import type { Result } from '../../kernel/result.js';

export interface LeadOtpDeliveryInput {
  /** `null` cuando el lead se identifico por telefono: no hay correo al que enviar. */
  readonly email: string | null;
  /** `null` cuando el lead se identifico por correo: no hay telefono al que enviar. */
  readonly telefono: string | null;
  readonly codigo: string;
}

export interface LeadOtpDeliveryPort {
  /**
   * Best-effort desde la perspectiva del caller: el codigo YA se genero y es
   * valido aunque el envio falle (el controller lo trata como accion
   * secundaria, ver `lead-auth.controller.ts`). Este puerto igual devuelve
   * `Result` para que cada adapter pueda distinguir y loguear su propio fallo.
   */
  send(input: LeadOtpDeliveryInput): Promise<Result<void>>;
}
