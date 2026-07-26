/**
 * Envio de mentira del OTP del lead. Capa: infrastructure (adapter de
 * `LeadOtpDeliveryPort`).
 *
 * Es el provider por defecto (`EMAIL_PROVIDER=mock`): loguea que el codigo se
 * "envio" sin tocar red ni credenciales, igual que `StubLlmAdapter` con
 * `LLM_PROVIDER=stub`. Equivalente a lo que antes vivia inline en
 * `lead-auth.controller.ts`, ahora detras del puerto para que el controller no
 * sepa si el envio es real o simulado.
 */

import type {
  LeadOtpDeliveryInput,
  LeadOtpDeliveryPort,
} from '../../application/ports/lead-otp-delivery.port.js';
import type { Result } from '../../kernel/result.js';
import { ok } from '../../kernel/result.js';
import { logger } from '../logging/logger.js';

export class MockLeadOtpDeliveryAdapter implements LeadOtpDeliveryPort {
  send(input: LeadOtpDeliveryInput): Promise<Result<void>> {
    // Nunca se loguea `codigo`: aunque sea un mock, el habito correcto es el
    // mismo que con un canal real (OWASP A09, no-PII-in-logs).
    logger.info(
      { canal: 'mock', tieneEmail: input.email !== null, tieneTelefono: input.telefono !== null },
      'OTP generado (envio simulado)',
    );
    return Promise.resolve(ok(undefined));
  }
}
