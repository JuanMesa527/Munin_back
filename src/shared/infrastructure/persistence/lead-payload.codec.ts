import { z } from 'zod';
import type { EnrichedLead, LeadProfile } from '@contracts';

const SlotSchema = z.enum([
  'nombre',
  'email',
  'telefono',
  'edad',
  'estadoCivil',
  'afiliacion',
  'rangoSalarial',
  'segmento',
  'personasACargo',
  'ciudad',
  'segmentoFamiliar',
  'ahorro',
  'capacidadAhorroMensual',
]);

const ConsentRecordSchema = z.strictObject({
  otorgado: z.boolean(),
  versionPolitica: z.string(),
  finalidades: z.array(
    z.enum(['perfilamiento_vivienda', 'contacto_comercial', 'educacion_financiera']),
  ),
  otorgadoEn: z.string(),
  canal: z.string(),
});

const FactorSchema = z.strictObject({
  nombre: z.string(),
  peso: z.number(),
  valor: z.string(),
  contribucion: z.number(),
  intensidad: z.number(),
});

const ScoreResultSchema = z.strictObject({
  valor: z.number(),
  factores: z.array(FactorSchema),
  weightsVersion: z.string(),
  calculadoEn: z.string(),
});

const CapacityBandSchema = z.strictObject({
  banda: z.enum(['alta', 'media', 'baja']),
  faltantes: z.array(SlotSchema),
  cuotaMensualEstimada: z.number().nullable(),
  precioMaximoEstimado: z.number().nullable(),
});

const ProjectMatchSchema = z.strictObject({
  proyectoId: z.string(),
  similitud: z.number(),
  razon: z.string(),
  nombre: z.string(),
  etapa: z.string(),
  precioDesde: z.number(),
  tipologia: z.string(),
});

const ContactIdentitySchema = z.strictObject({
  nombre: z.string(),
  telefonoEnmascarado: z.string(),
  contactoTokenId: z.string(),
});

const LeadProfileObjectSchema = z.strictObject({
  id: z.string(),
  consentimiento: ConsentRecordSchema.nullable(),
  identidad: ContactIdentitySchema.nullable(),
  nombre: z.string().nullable(),
  email: z.string().nullable(),
  telefono: z.string().nullable(),
  edad: z.number().nullable(),
  estadoCivil: z.string().nullable(),
  esAfiliado: z.boolean().nullable(),
  rangoSalarial: z.string().nullable(),
  segmento: z.enum(['Basico', 'Medio', 'Alto', 'Joven']).nullable(),
  personasACargo: z.number().nullable(),
  ciudad: z.string().nullable(),
  segmentoFamiliar: z.string().nullable(),
  ahorroDeclarado: z.number().nullable(),
  capacidadAhorroMensual: z.number().nullable(),
  // `.default(null)`: filas persistidas ANTES de agregar estos slots no traen
  // la clave; sin el default, cargarlas rompería el parse en vez de degradar.
  tieneVivienda: z.boolean().nullable().default(null),
  vinculacionLaboral: z.enum(['formal', 'independiente', 'informal']).nullable().default(null),
  horizonteCompra: z.enum(['ya', 'pronto', 'explorando']).nullable().default(null),
  slotsLlenos: z.array(SlotSchema),
  capacidad: CapacityBandSchema.nullable(),
  score: ScoreResultSchema.nullable(),
  proyectos: z.array(ProjectMatchSchema),
  carril: z.enum(['viable', 'no_viable']).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ContactPreferenceSchema = z.strictObject({
  canalPreferido: z.string(),
  mejorHorario: z.string(),
});

const ContactabilityDaySchema = z.strictObject({
  dia: z.enum(['L', 'M', 'X', 'J', 'V', 'S', 'D']),
  intensidad: z.number(),
});

const LeadTimelineEventSchema = z.strictObject({
  label: z.string(),
  fecha: z.string(),
  hito: z.enum(['ingreso', 'consentimiento', 'perfilamiento', 'nutricion', 'viable']),
});

export const LeadProfilePayloadSchema = LeadProfileObjectSchema satisfies z.ZodType<LeadProfile>;

export const EnrichedLeadPayloadSchema = LeadProfileObjectSchema.extend({
  intereses: z.array(z.string()),
  zonaPreferida: z.string().nullable(),
  timingCompra: z.string().nullable(),
  motivacion: z.string().nullable(),
  contacto: ContactPreferenceSchema.nullable(),
  intentScore: z.number(),
  enriquecidoEn: z.string(),
  ocupacion: z.string().nullable(),
  hogar: z.string().nullable(),
  ingresosSmmlv: z.number().nullable(),
  subsidioEstimado: z.number().nullable(),
  citaTextual: z.string().nullable(),
  contactabilidad: z.array(ContactabilityDaySchema),
  horarioRazon: z.string().nullable(),
  timeline: z.array(LeadTimelineEventSchema),
}) satisfies z.ZodType<EnrichedLead>;

/** `saveEnriched` refresca también la vista base, igual que el adapter en memoria. */
export const StoredLeadProfilePayloadSchema = z.union([
  EnrichedLeadPayloadSchema,
  LeadProfilePayloadSchema,
]) satisfies z.ZodType<LeadProfile>;
