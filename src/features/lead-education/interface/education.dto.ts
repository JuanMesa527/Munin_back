/**
 * DTOs de entrada de F2.2. Capa: interface.
 *
 * OWASP A03: nada entra al caso de uso sin pasar por zod. Los strings llevan
 * largo maximo — ademas de higiene, acota la superficie de prompt injection si
 * el texto alguna vez llegara a un LLM.
 */

import { z } from 'zod';

/** Los ids son opacos y cortos; 64 chars cubre cualquier uuid con holgura. */
const LeadIdSchema = z.string().trim().min(1).max(64);

export const JourneyRequestSchema = z.object({
  leadId: LeadIdSchema,
});

export type JourneyRequest = z.infer<typeof JourneyRequestSchema>;

export const JourneyQuerySchema = z.object({
  leadId: LeadIdSchema,
});

export type JourneyQuery = z.infer<typeof JourneyQuerySchema>;

/**
 * Evento de progreso. `valor` se acota por arriba para que nadie "complete" una
 * meta de ahorro mandando un numero absurdo: el dominio ya lo topa al objetivo,
 * pero rechazarlo en el borde deja el error explicito.
 *
 * `fechaObjetivo` (adenda A10) es OPCIONAL y ortogonal al evento de progreso:
 * cuando viaja, el caso de uso configura la fecha limite de `metaId` ademas de
 * (no en lugar de) aplicar el evento — ver `RecordProgressUseCase`.
 */
export const ProgressRequestSchema = z.object({
  leadId: LeadIdSchema,
  tipo: z.enum(['ahorro_registrado', 'contenido_visto', 'meta_completada', 'afiliacion_iniciada']),
  metaId: z.string().trim().min(1).max(64).nullable(),
  valor: z.number().int().nonnegative().max(10_000_000_000),
  fechaObjetivo: z.iso.datetime().nullable().optional(),
});

export type ProgressRequest = z.infer<typeof ProgressRequestSchema>;
