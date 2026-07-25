/**
 * DTOs zod de F5 (call-simulation). Capa: interface (borde HTTP).
 *
 * OWASP A03: nada entra a un caso de uso sin pasar por aqui. `closerDijo` se
 * acota a 500 chars, mismo tope que F1 (`texto`) — higiene y superficie de
 * prompt injection, sin importar que aqui viaje hacia `CallSimulatorPort` y no
 * hacia `LlmPort`.
 *
 * `PersonaContextSchema` es, ademas de validacion, la SEGUNDA barrera contra
 * PII: aunque el cliente intentara mandar un campo `telefono`, el schema no lo
 * declara y zod lo descarta por defecto (mismo patron que `SubmitConsentRequestSchema`
 * en F1 con `leadId`).
 */

import { z } from 'zod';

const IdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/u, 'formato de id no valido');

const TEXTO_MAX_LARGO = 500;
const TEXTO_CORTO_MAX_LARGO = 300;
const TEXTO_MEDIO_MAX_LARGO = 400;

export const CallDifficultySchema = z.enum(['receptivo', 'realista', 'dificil']);

const SegmentoSchema = z.enum(['Basico', 'Medio', 'Alto', 'Joven']);

const ObjecionSugeridaSchema = z.object({
  pregunta: z.string().trim().min(1).max(TEXTO_CORTO_MAX_LARGO),
  respuesta: z.string().trim().min(1).max(TEXTO_MEDIO_MAX_LARGO),
});

const TalkingPointSchema = z.object({
  titulo: z.string().trim().min(1).max(120),
  detalle: z.string().trim().min(1).max(TEXTO_CORTO_MAX_LARGO),
  origen: z.enum(['score', 'matching', 'intereses', 'capacidad', 'nutricion']),
  prioridad: z.number().int().min(0).max(100),
});

/**
 * Recorte SIN PII del `BriefingSheet` (adenda A11). Nunca declara telefono,
 * apellidos ni documento: lo que no esta en el schema no puede llegar al
 * caso de uso, sin importar que mande el cliente.
 */
export const PersonaContextSchema = z.object({
  primerNombre: z.string().trim().min(1).max(40),
  edad: z.number().int().min(0).max(120).nullable(),
  ocupacion: z.string().trim().max(120).nullable(),
  ciudad: z.string().trim().max(120).nullable(),
  hogar: z.string().trim().max(200).nullable(),
  ingresosSmmlv: z.number().min(0).max(1000).nullable(),
  segmento: SegmentoSchema.nullable(),
  motivacion: z.string().trim().max(TEXTO_CORTO_MAX_LARGO).nullable(),
  intereses: z.array(z.string().trim().max(60)).max(20),
  citaTextual: z.string().trim().max(TEXTO_MEDIO_MAX_LARGO).nullable(),
  objeciones: z.array(ObjecionSugeridaSchema).max(10),
  talkingPoints: z.array(TalkingPointSchema).max(10),
});

export const StartCallBodySchema = z.object({
  leadId: IdSchema,
  dificultad: CallDifficultySchema,
  persona: PersonaContextSchema,
});
export type StartCallBody = z.infer<typeof StartCallBodySchema>;

export const CallTurnBodySchema = z.object({
  callId: IdSchema,
  closerDijo: z.string().trim().min(1).max(TEXTO_MAX_LARGO),
});
export type CallTurnBody = z.infer<typeof CallTurnBodySchema>;

export const EndCallBodySchema = z.object({
  callId: IdSchema,
});
export type EndCallBody = z.infer<typeof EndCallBodySchema>;

/**
 * Tope de audio por tramo (adenda A12). 30 s de PCM 16-bit a 16 kHz son
 * ~960 KB crudos, ~1,3 MB ya en base64; 1,5 MB deja margen y queda por debajo
 * del techo de 2 MB del parser, para que quien se pase reciba un 400 legible
 * de zod y no un 413 opaco del body parser.
 *
 * El limite NO es cosmetico: sin el, un cliente puede subir horas de audio y
 * convertir el endpoint en un amplificador de costo contra nuestra cuenta de
 * AWS (Transcribe cobra por segundo). Un turno de venta hablado no pasa de
 * media docena de frases.
 */
const AUDIO_BASE64_MAX_LARGO = 1_500_000;

export const TranscribeBodySchema = z.object({
  base64: z.base64().min(1).max(AUDIO_BASE64_MAX_LARGO),
  /** Los que acepta Transcribe para PCM; el front captura a 16 kHz. */
  sampleRate: z.number().int().min(8000).max(48000),
  /**
   * Opcional (adenda A14): con el, el audio se guarda para archivar la
   * llamada. Sin el, se transcribe y se descarta. Es opcional a proposito —
   * transcribir NO exige tener una llamada abierta, y hacerlo obligatorio
   * acoplaria el dictado al ciclo de vida de la sesion.
   */
  callId: IdSchema.optional(),
});
export type TranscribeBody = z.infer<typeof TranscribeBodySchema>;
