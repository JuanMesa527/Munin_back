import { z } from 'zod';
import type { EducationJourney } from '@contracts';

const EtapaIdSchema = z.enum(['descubrir', 'capacidad', 'financiar', 'prepararse', 'llegar']);

const NonViableReasonSchema = z.enum([
  'sin_capacidad',
  'ahorro_insuficiente',
  'no_afiliado_sin_cupo',
  'score_bajo',
  'datos_insuficientes',
]);

const NurturePlanSchema = z.strictObject({
  precioObjetivo: z.number(),
  subsidioEstimado: z.number(),
  cuotaInicialObjetivo: z.number(),
  gap: z.number(),
  mesesParaCalificar: z.number(),
  proyectoObjetivoId: z.string(),
  aplicaSubsidio: z.boolean(),
});

const AporteAhorroSchema = z.strictObject({
  id: z.string(),
  monto: z.number(),
  ocurridoEn: z.string(),
});

const MetaSchema = z.strictObject({
  id: z.string(),
  titulo: z.string(),
  descripcion: z.string(),
  tipo: z.enum(['ahorro', 'documentacion', 'afiliacion', 'educacion']),
  objetivo: z.number(),
  alcanzado: z.number(),
  completada: z.boolean(),
  puntos: z.number(),
  badgeId: z.string().nullable(),
  etapa: EtapaIdSchema.optional(),
  fechaObjetivo: z.string().optional(),
  aportes: z.array(AporteAhorroSchema).optional(),
  completadaEn: z.string().optional(),
  opcional: z.boolean().optional(),
});

const BadgeSchema = z.strictObject({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string(),
  icono: z.string(),
  desbloqueadoEn: z.string().nullable(),
});

const EtapaCaminoSchema = z.strictObject({
  id: EtapaIdSchema,
  titulo: z.string(),
  icono: z.string(),
  orden: z.number(),
});

/**
 * `as z.ZodType<...>` en vez de `satisfies`: los campos opcionales de `Meta`
 * (`etapa?`, `aportes?`, etc.) hacen que zod infiera `T | undefined` bajo la
 * clave opcional, y con `exactOptionalPropertyTypes` eso no es exactamente
 * igual a `etapa?: T` (clave ausente O `T`, nunca `undefined` explicito). En
 * runtime da lo mismo (zod jamas escribe `undefined` explicito, solo omite la
 * clave), asi que el cast es seguro; lo que no calza es la firma de tipos de
 * zod frente a `exactOptionalPropertyTypes`, no el dato real.
 */
export const EducationJourneyPayloadSchema = z.strictObject({
  leadId: z.string(),
  plan: NurturePlanSchema,
  metas: z.array(MetaSchema),
  progreso: z.number(),
  puntosTotales: z.number(),
  badges: z.array(BadgeSchema),
  reclasificadoAViable: z.boolean(),
  razonesIngreso: z.array(NonViableReasonSchema),
  etapas: z.array(EtapaCaminoSchema).optional(),
  actualizadoEn: z.string(),
}) as z.ZodType<EducationJourney>;
