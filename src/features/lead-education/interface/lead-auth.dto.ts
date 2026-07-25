/**
 * DTOs del login por OTP del lead (F2.2, adenda A14). Capa: interface.
 *
 * OWASP A03: nada entra al caso de uso sin pasar por zod. `telefono`/`email`
 * son mutuamente EXCLUYENTES a proposito: el usuario elige un solo canal por
 * intento, para no ambiguar por cual se resuelve el lead.
 */

import { z } from 'zod';

const TelefonoSchema = z
  .string()
  .trim()
  .min(7, 'Telefono invalido')
  .max(20, 'Telefono invalido')
  .regex(/^[\d+\s-]+$/u, 'Telefono invalido');

const ContactoSchema = z
  .object({
    telefono: TelefonoSchema.nullable().default(null),
    email: z.email('Email invalido').nullable().default(null),
  })
  .refine((valor) => (valor.telefono !== null) !== (valor.email !== null), {
    message: 'Envia exactamente un telefono o un email, no ambos ni ninguno',
  });

export const RequestOtpBodySchema = ContactoSchema;
export type RequestOtpBody = z.infer<typeof RequestOtpBodySchema>;

export const VerifyOtpBodySchema = z.object({
  telefono: TelefonoSchema.nullable().default(null),
  email: z.email('Email invalido').nullable().default(null),
  codigo: z
    .string()
    .trim()
    .length(6, 'El codigo tiene 6 digitos')
    .regex(/^\d{6}$/u, 'El codigo tiene 6 digitos'),
}).refine((valor) => (valor.telefono !== null) !== (valor.email !== null), {
  message: 'Envia exactamente un telefono o un email, no ambos ni ninguno',
});
export type VerifyOtpBody = z.infer<typeof VerifyOtpBodySchema>;
