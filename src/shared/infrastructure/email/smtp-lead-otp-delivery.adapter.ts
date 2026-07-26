/**
 * Envio REAL del OTP del lead por SMTP (`EMAIL_PROVIDER=smtp`). Capa:
 * infrastructure (adapter de `LeadOtpDeliveryPort`).
 *
 * Sobre `nodemailer` contra un servidor SMTP generico (pensado para Gmail con
 * "contrasena de aplicacion", pero cualquier SMTP estandar sirve). Mismo
 * criterio que `DeepSeekLlmAdapter.solicitar`: unico punto de I/O real,
 * cualquier excepcion se envuelve en `Result` en vez de escapar como `throw`.
 */

import nodemailer from 'nodemailer';
import type {
  LeadOtpDeliveryInput,
  LeadOtpDeliveryPort,
} from '../../application/ports/lead-otp-delivery.port.js';
import { ValidationError } from '../../kernel/errors.js';
import type { Result } from '../../kernel/result.js';
import { err, ok } from '../../kernel/result.js';
import { logger } from '../logging/logger.js';

/** El lead vence su OTP a los 5 minutos (mismo TTL que `InMemoryLeadOtpStore`). */
const MINUTOS_VENCIMIENTO = 5;

export interface SmtpLeadOtpDeliveryAdapterConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  /** Remitente que ve el lead. Si no se especifica, se usa `user` (Gmail lo exige igual). */
  readonly from?: string;
}

function textoCorreo(codigo: string): string {
  return `Tu codigo de acceso a Colsubsidio es: ${codigo}\n\nVence en ${String(MINUTOS_VENCIMIENTO)} minutos. Si no lo solicitaste, ignora este mensaje.`;
}

function htmlCorreo(codigo: string): string {
  return `<p>Tu codigo de acceso a Colsubsidio es: <strong>${codigo}</strong></p><p>Vence en ${String(MINUTOS_VENCIMIENTO)} minutos. Si no lo solicitaste, ignora este mensaje.</p>`;
}

export class SmtpLeadOtpDeliveryAdapter implements LeadOtpDeliveryPort {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: SmtpLeadOtpDeliveryAdapterConfig) {
    this.from = config.from ?? config.user;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 es SMTPS (TLS implicito desde el saludo); el resto (587, etc.)
      // arranca en claro y sube a TLS con STARTTLS. Gmail soporta ambos.
      secure: config.port === 465,
      auth: { user: config.user, pass: config.password },
    });
  }

  async send(input: LeadOtpDeliveryInput): Promise<Result<void>> {
    if (input.email === null) {
      // Limitacion de alcance conocida, no un error del sistema: SMTP no puede
      // entregar a un telefono. El lead igual recibe el codigo por la
      // respuesta HTTP fuera de produccion (ver `lead-auth.controller.ts`).
      logger.warn(
        { canal: 'smtp' },
        'no hay canal de entrega real para este contacto (solo telefono, SMTP no envia SMS)',
      );
      return ok(undefined);
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: input.email,
        subject: 'Tu codigo de acceso — Colsubsidio',
        text: textoCorreo(input.codigo),
        html: htmlCorreo(input.codigo),
      });
      return ok(undefined);
    } catch (causa) {
      logger.error({ err: causa }, 'fallo enviando el correo con el codigo de acceso por SMTP');
      return err(new ValidationError('No se pudo enviar el correo con el codigo de acceso'));
    }
  }
}
