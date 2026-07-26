/**
 * DTOs de entrada de F2.1. Capa: interface.
 *
 * OWASP A03: nada entra a un caso de uso sin pasar por aqui. Los strings llevan
 * largo maximo porque acotar la entrada es lo que limita tanto la inyeccion
 * clasica como la de prompt si el texto termina cerca del LLM.
 */

import { z } from 'zod';
import type { EnrichmentSessionSummary, EnrichmentTelemetry, ViewEvent } from '@contracts';
import { DIAS_CONTACTO, FRANJAS_CONTACTO } from '@contracts';

/**
 * Los ids del dominio son opacos (`IdGeneratorPort`), asi que se acotan a
 * caracteres seguros para URL y a un largo razonable. Un id de 4 KB solo sirve
 * para hacerle daño a quien lo indexe.
 */
const IdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/u, 'formato de id no valido');

export const DeckQuerySchema = z.object({
  leadId: IdSchema,
  /** Tope duro de 50: la baraja es para deslizar, no para paginar. */
  limite: z.coerce.number().int().positive().max(50).optional(),
});

export type DeckQuery = z.infer<typeof DeckQuerySchema>;

/**
 * Tope de un intervalo de atencion en ms. 6 horas: mas que eso no es tiempo de
 * lectura, es una pestana olvidada abierta, y no queremos que sesgue las medias.
 */
const MAX_DWELL_MS = 6 * 60 * 60 * 1000;

export const SwipeBodySchema = z.object({
  leadId: IdSchema,
  proyectoId: IdSchema,
  accion: z.enum(['pass', 'like', 'favorito']),
  /** --- Telemetria opcional de la tarjeta --- */
  dwellMs: z.number().int().nonnegative().max(MAX_DWELL_MS).optional(),
  abrioDetalle: z.boolean().optional(),
  detalleMs: z.number().int().nonnegative().max(MAX_DWELL_MS).optional(),
});

export type SwipeBody = z.infer<typeof SwipeBodySchema>;

/**
 * "¿Cuándo te llamamos?" del cierre de F2.1. OPCIONAL: si el titular no
 * responde, la ficha muestra "Sin franja preferida" — nunca un horario
 * inventado. Vocabulario cerrado para que el closer lea siempre lo mismo.
 */
const PreferenciaContactoSchema = z.object({
  dias: z.array(z.enum(DIAS_CONTACTO)).min(1).max(DIAS_CONTACTO.length),
  franjas: z.array(z.enum(FRANJAS_CONTACTO)).min(1).max(FRANJAS_CONTACTO.length),
});

export const SummaryBodySchema = z.object({
  leadId: IdSchema,
  preferenciaContacto: PreferenciaContactoSchema.nullish(),
});

export type SummaryBody = z.infer<typeof SummaryBodySchema>;

/* --------------------------------------------------------------------------
 *  Telemetria de atencion
 * ------------------------------------------------------------------------ */

const ViewEventSchema = z.object({
  leadId: IdSchema,
  // `null` cuando la seccion no es de un proyecto puntual (deck, resumen).
  proyectoId: IdSchema.nullable(),
  seccion: z.enum(['deck', 'card', 'detalle', 'factores', 'resumen']),
  dwellMs: z.number().int().nonnegative().max(MAX_DWELL_MS),
  ocurridoEn: z.iso.datetime(),
}) satisfies z.ZodType<ViewEvent>;

const SessionSummarySchema = z.object({
  leadId: IdSchema,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  totalTarjetas: z.number().int().nonnegative().max(1000),
  decididas: z.number().int().nonnegative().max(1000),
  likes: z.number().int().nonnegative().max(1000),
  favoritos: z.number().int().nonnegative().max(1000),
  passes: z.number().int().nonnegative().max(1000),
  intentScore: z.number().int().min(0).max(100),
  tiempoTotalMs: z.number().int().nonnegative().max(MAX_DWELL_MS),
}) satisfies z.ZodType<EnrichmentSessionSummary>;

export const TelemetryBodySchema = z
  .object({
    // Tope duro: la baraja tiene ~12 tarjetas; 500 vistas es de sobra y acota abuso.
    views: z.array(ViewEventSchema).max(500),
    session: SessionSummarySchema,
  })
  .superRefine((telemetry, context) => {
    telemetry.views.forEach((view, index) => {
      if (view.leadId !== telemetry.session.leadId) {
        context.addIssue({
          code: 'custom',
          path: ['views', index, 'leadId'],
          message: 'el leadId de la vista debe coincidir con el de la sesion',
        });
      }
    });
  }) satisfies z.ZodType<EnrichmentTelemetry>;

export type TelemetryBody = z.infer<typeof TelemetryBodySchema>;
