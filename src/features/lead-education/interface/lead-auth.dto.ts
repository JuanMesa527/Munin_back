/**
 * DTOs del login por OTP del lead (F2.2, adenda A14). Capa: interface.
 *
 * OWASP A03: nada entra al caso de uso sin pasar por zod. Los TRES canales
 * (`telefono`, `email`, `leadId`) son mutuamente EXCLUYENTES a proposito: se
 * manda uno solo por intento, para no ambiguar por cual se resuelve el lead.
 *
 * `leadId` es el canal del GATE: el lead viene de terminar F1, la app tiene su
 * id en memoria y el correo ya se lo dio al chat — no tiene por que volver a
 * escribirlo. Los otros dos son el canal de RECUPERACION (cerro la pestana y
 * perdio el id). Que el id no baste por si solo es justamente el punto: da
 * derecho a pedir el codigo, no a entrar.
 */

import { z } from 'zod';

const TelefonoSchema = z
  .string()
  .trim()
  .min(7, 'Telefono invalido')
  .max(20, 'Telefono invalido')
  .regex(/^[\d+\s-]+$/u, 'Telefono invalido');

const CanalSchema = {
  telefono: TelefonoSchema.nullable().default(null),
  email: z.email('Email invalido').nullable().default(null),
  // Mismo criterio laxo que `education.dto.ts`: los ids de demo (`seedDemoLeads`)
  // no son uuid y un `z.uuid()` aca los dejaria fuera del gate.
  leadId: z.string().trim().min(1).max(64).nullable().default(null),
};

/** Exactamente uno de los tres canales; ni cero ni dos. */
function unSoloCanal(valor: {
  telefono: string | null;
  email: string | null;
  leadId: string | null;
}): boolean {
  return [valor.telefono, valor.email, valor.leadId].filter((canal) => canal !== null).length === 1;
}

const MENSAJE_CANAL = 'Envia exactamente un canal: telefono, email o leadId';

export const RequestOtpBodySchema = z.object(CanalSchema).refine(unSoloCanal, {
  message: MENSAJE_CANAL,
});
export type RequestOtpBody = z.infer<typeof RequestOtpBodySchema>;

export const VerifyOtpBodySchema = z
  .object({
    ...CanalSchema,
    codigo: z
      .string()
      .trim()
      .length(6, 'El codigo tiene 6 digitos')
      .regex(/^\d{6}$/u, 'El codigo tiene 6 digitos'),
  })
  .refine(unSoloCanal, { message: MENSAJE_CANAL });
export type VerifyOtpBody = z.infer<typeof VerifyOtpBodySchema>;
