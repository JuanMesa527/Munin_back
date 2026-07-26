/**
 * Fabrica del `LeadOtpDeliveryPort`. Capa: infrastructure.
 * Mismo patron que `llm.factory.ts`: un solo lugar decide que adapter se usa,
 * para que el controller nunca importe un adapter concreto y el cambio de
 * canal de envio sea una variable de entorno.
 */

import type { LeadOtpDeliveryPort } from '../../application/ports/lead-otp-delivery.port.js';
import type { AppEnv } from '../config/env.js';
import { MockLeadOtpDeliveryAdapter } from './mock-lead-otp-delivery.adapter.js';
import { SmtpLeadOtpDeliveryAdapter } from './smtp-lead-otp-delivery.adapter.js';

export function createLeadOtpDeliveryPort(env: AppEnv): LeadOtpDeliveryPort {
  if (env.emailProvider === 'smtp') {
    if (env.smtpUser === null || env.smtpPassword === null) {
      // `loadEnv` ya valida esto; el chequeo se repite por el mismo motivo que
      // `LLM_PROVIDER=anthropic`: un puerto mal construido falla en el primer
      // OTP, delante del jurado.
      throw new Error('EMAIL_PROVIDER=smtp exige SMTP_USER y SMTP_PASSWORD');
    }
    return new SmtpLeadOtpDeliveryAdapter({
      host: env.smtpHost,
      port: env.smtpPort,
      user: env.smtpUser,
      password: env.smtpPassword,
      ...(env.smtpFrom !== null ? { from: env.smtpFrom } : {}),
    });
  }

  // Default deliberado: sin credenciales el proyecto igual corre de punta a
  // punta (demo sin bandeja de entrada real).
  return new MockLeadOtpDeliveryAdapter();
}
