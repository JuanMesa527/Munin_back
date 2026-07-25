/**
 * DTOs de entrada de F2.1. Capa: interface.
 *
 * OWASP A03: nada entra a un caso de uso sin pasar por aqui. Los strings llevan
 * largo maximo porque acotar la entrada es lo que limita tanto la inyeccion
 * clasica como la de prompt si el texto termina cerca del LLM.
 */

import { z } from 'zod';

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
  /** --- Telemetria opcional de la tarjeta (adenda A10) --- */
  dwellMs: z.number().int().nonnegative().max(MAX_DWELL_MS).optional(),
  abrioDetalle: z.boolean().optional(),
  detalleMs: z.number().int().nonnegative().max(MAX_DWELL_MS).optional(),
});

export type SwipeBody = z.infer<typeof SwipeBodySchema>;

export const SummaryBodySchema = z.object({
  leadId: IdSchema,
});

export type SummaryBody = z.infer<typeof SummaryBodySchema>;

/* --------------------------------------------------------------------------
 *  Telemetria de atencion (adenda A10)
 * ------------------------------------------------------------------------ */

const ViewEventSchema = z.object({
  // `null` cuando la seccion no es de un proyecto puntual (deck, resumen).
  proyectoId: IdSchema.nullable(),
  seccion: z.enum(['deck', 'card', 'detalle', 'factores', 'resumen']),
  dwellMs: z.number().int().nonnegative().max(MAX_DWELL_MS),
  ocurridoEn: z.iso.datetime(),
});

const SessionSummarySchema = z.object({
  startedEn: z.iso.datetime(),
  endedEn: z.iso.datetime(),
  totalTarjetas: z.number().int().nonnegative().max(1000),
  decididas: z.number().int().nonnegative().max(1000),
  likes: z.number().int().nonnegative().max(1000),
  favoritos: z.number().int().nonnegative().max(1000),
  passes: z.number().int().nonnegative().max(1000),
  intentScore: z.number().int().min(0).max(100),
  tiempoTotalMs: z.number().int().nonnegative().max(MAX_DWELL_MS),
  // Senal gruesa de dispositivo, no PII: se acota el largo por higiene (A03).
  viewport: z.string().trim().max(20).nullable(),
  dispositivo: z.string().trim().max(20).nullable(),
});

export const TelemetryBodySchema = z.object({
  leadId: IdSchema,
  // Tope duro: la baraja tiene ~12 tarjetas; 500 vistas es de sobra y acota abuso.
  vistas: z.array(ViewEventSchema).max(500),
  sesion: SessionSummarySchema.nullable(),
});

export type TelemetryBody = z.infer<typeof TelemetryBodySchema>;
