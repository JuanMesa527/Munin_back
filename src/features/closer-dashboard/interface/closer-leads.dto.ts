import { z } from 'zod';

const QueryBooleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const CloserLeadsQuerySchema = z
  .object({
    soloAfiliados: QueryBooleanSchema.optional().transform((value) => value ?? null),
    soloNutridos: QueryBooleanSchema.optional().transform((value) => value ?? null),
    segmento: z
      .enum(['Basico', 'Medio', 'Alto', 'Joven'])
      .optional()
      .transform((value) => value ?? null),
    ciudad: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .transform((value) => value ?? null),
    scoreMinimo: z.coerce
      .number()
      .min(0)
      .max(100)
      .optional()
      .transform((value) => value ?? null),
    banda: z
      .enum(['alta', 'media', 'baja'])
      .optional()
      .transform((value) => value ?? null),
    sort: z
      .enum(['score_desc', 'capacidad_desc', 'intent_desc', 'recencia_desc'])
      .default('score_desc'),
    pagina: z.coerce.number().int().positive().default(1),
    porPagina: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type CloserLeadsQuery = z.output<typeof CloserLeadsQuerySchema>;
