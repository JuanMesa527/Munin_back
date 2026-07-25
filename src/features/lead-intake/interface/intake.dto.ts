/**
 * DTOs zod de F1 (lead-intake). Capa: interface (borde HTTP).
 * Unico lugar donde el payload crudo del cliente se valida antes de tocar
 * `application/` (spec lead-intake-interface "Zod Validation at Every
 * Endpoint"). `texto` se acota a 500 chars: higiene y superficie de prompt
 * injection (regla 12/EQUIPO.md).
 */

import { z } from 'zod';

const FINALIDADES_TRATAMIENTO = [
  'perfilamiento_vivienda',
  'contacto_comercial',
  'educacion_financiera',
] as const;

const TEXTO_MAX_LARGO = 500;

/**
 * `/start` no recibe body, pero se valida igual (schema vacio) para que los
 * tres endpoints de `API_ROUTES.intake.*` pasen por `validateBody` de forma
 * pareja (spec "Zod Validation at Every Endpoint").
 */
export const StartConversationRequestSchema = z.object({});
export type StartConversationRequest = z.infer<typeof StartConversationRequestSchema>;

/**
 * `/consent` NUNCA acepta `leadId` (design.md D6, threat matrix
 * "client-controlled identifier"): el schema simplemente no lo declara. zod
 * descarta cualquier clave desconocida por defecto (ver comentario en
 * `validate.ts`), asi que un `leadId` inyectado por el cliente queda
 * "stripped" antes de llegar al caso de uso, sin necesidad de rechazar el
 * request completo.
 */
export const SubmitConsentRequestSchema = z.object({
  otorgado: z.boolean(),
  versionPolitica: z.string().trim().min(1).max(50),
  finalidades: z.array(z.enum(FINALIDADES_TRATAMIENTO)).min(1),
  canal: z.string().trim().min(1).max(50),
});
export type SubmitConsentRequest = z.infer<typeof SubmitConsentRequestSchema>;

export const ProcessConversationTurnRequestSchema = z
  .object({
    leadId: z.string().trim().min(1),
    texto: z.string().trim().max(TEXTO_MAX_LARGO).nullable(),
    quickReplyValue: z.string().trim().max(TEXTO_MAX_LARGO).nullable(),
  })
  .refine((data) => data.texto !== null || data.quickReplyValue !== null, {
    message: 'Se requiere texto o quickReplyValue',
    path: ['texto'],
  });
export type ProcessConversationTurnRequest = z.infer<typeof ProcessConversationTurnRequestSchema>;
