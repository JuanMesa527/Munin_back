/**
 * Repositorio de leads sobre Supabase Postgres. Capa: infrastructure
 * (adapter de `LeadRepository`). Driver opcional, seleccionado por
 * `PERSISTENCE_DRIVER=supabase` (design.md D10). `InMemoryLeadRepository`
 * sigue siendo el driver por defecto: este adapter no lo reemplaza.
 *
 * Alcance: `save` + `findById` solamente. `saveEnriched`, `findEnrichedById`
 * y `listViable` son responsabilidad de F2.1/F3 (no existe una tabla
 * `enriched_leads` todavia) y se quedan como stub, igual que
 * `InMemoryLeadRepository`.
 *
 * Toda la logica de mapeo vive en `toRow`/`toDomain`, funciones PURAS y
 * exportadas para poder testearlas sin una base de datos real
 * (`config.yaml` `integration: false`). La clase solo hace I/O: construye el
 * cliente y llama a Postgrest. Un fallo de infraestructura (red, credenciales,
 * columna corrupta) hace que el adapter *reviente*: NO es `DataUnavailableError`
 * (esa se reserva para el catalogo sin calibrar) y `errorHandler` lo convierte
 * en un 500 generico sin fuga de detalles (OWASP A09).
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  EnrichedLead,
  LeadListFilters,
  LeadListPage,
  LeadListSort,
  LeadProfile,
} from '@contracts';
import type { LeadRepository } from '../../../application/ports/lead-repository.port.js';
import { NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';

const TABLA = 'lead_profiles' as const;

const FINALIDADES = [
  'perfilamiento_vivienda',
  'contacto_comercial',
  'educacion_financiera',
] as const;
const BANDAS = ['alta', 'media', 'baja'] as const;
const SEGMENTOS_VALIDOS = ['Basico', 'Medio', 'Alto', 'Joven'] as const;
const CARRILES_VALIDOS = ['viable', 'no_viable'] as const;
const SLOTS_VALIDOS = [
  'afiliacion',
  'rangoSalarial',
  'segmento',
  'personasACargo',
  'ciudad',
  'segmentoFamiliar',
  'ahorro',
  'capacidadAhorroMensual',
] as const;

/**
 * Schemas zod de las columnas jsonb (design.md D10 regla 3): la base de datos
 * es "nuestra", pero la fila que vuelve por la red sigue siendo una frontera
 * NO CONFIABLE en terminos de tipos. `segmento`/`carril`/`slots_llenos` no son
 * jsonb, pero se validan igual: son texto libre a nivel de columna y el
 * dominio los modela como uniones cerradas.
 */
const SlotSchema = z.enum(SLOTS_VALIDOS);
const SegmentoSchema = z.enum(SEGMENTOS_VALIDOS).nullable();
const CarrilSchema = z.enum(CARRILES_VALIDOS).nullable();

const ConsentimientoSchema = z.object({
  otorgado: z.boolean(),
  versionPolitica: z.string(),
  finalidades: z.array(z.enum(FINALIDADES)).min(1),
  otorgadoEn: z.string(),
  canal: z.string(),
});

const FactorSchema = z.object({
  nombre: z.string(),
  peso: z.number(),
  valor: z.string(),
  contribucion: z.number(),
});

const ScoreSchema = z.object({
  valor: z.number(),
  factores: z.array(FactorSchema),
  weightsVersion: z.string(),
  calculadoEn: z.string(),
});

const CapacidadSchema = z.object({
  banda: z.enum(BANDAS),
  faltantes: z.array(SlotSchema),
  cuotaMensualEstimada: z.number().nullable(),
  precioMaximoEstimado: z.number().nullable(),
});

const ProyectoSchema = z.object({
  proyectoId: z.string(),
  similitud: z.number(),
  razon: z.string(),
});

const ProyectosSchema = z.array(ProyectoSchema);

/**
 * Forma exacta de la fila de `lead_profiles`. Los jsonb quedan tipados
 * `unknown`: recien se afirman como el tipo del dominio DESPUES de pasar por
 * el schema zod correspondiente en `toDomain` — nunca con un cast directo.
 */
export interface SupabaseLeadRow {
  id: string;
  consentimiento: unknown;
  es_afiliado: boolean | null;
  rango_salarial: string | null;
  segmento: string | null;
  personas_a_cargo: number | null;
  ciudad: string | null;
  segmento_familiar: string | null;
  // bigint de Postgres, pero Postgrest lo sirve como JSON number: montos COP
  // enteros, muy por debajo de 2^53. NUNCA se escala aqui (EQUIPO §7 trampa 1).
  ahorro_declarado: number | null;
  capacidad_ahorro_mensual: number | null;
  slots_llenos: string[];
  capacidad: unknown;
  score: unknown;
  proyectos: unknown;
  carril: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Espejo *mapeado* (no `interface`) de `SupabaseLeadRow`, solo para el
 * esquema `Database` de abajo: `SupabaseClient<Database>` necesita que la
 * forma de `Row`/`Insert` cumpla estructuralmente `Record<string, unknown>`
 * para tipar `.from(TABLA)`, y TypeScript solo le da la firma de indice
 * implicita a los tipos mapeados/alias de objeto, nunca a una `interface`
 * (que admite declaration merging y por eso queda afuera de esa regla).
 */
type LeadProfilesRow = { [K in keyof SupabaseLeadRow]: SupabaseLeadRow[K] };

/**
 * `LeadProfile` -> fila. Pura: nunca toca la red. Los objetos anidados pasan
 * directo (Postgrest los serializa a jsonb); `save` es lo unico que la usa.
 */
export function toRow(profile: LeadProfile): SupabaseLeadRow {
  return {
    id: profile.id,
    consentimiento: profile.consentimiento,
    es_afiliado: profile.esAfiliado,
    rango_salarial: profile.rangoSalarial,
    segmento: profile.segmento,
    personas_a_cargo: profile.personasACargo,
    ciudad: profile.ciudad,
    segmento_familiar: profile.segmentoFamiliar,
    ahorro_declarado: profile.ahorroDeclarado,
    capacidad_ahorro_mensual: profile.capacidadAhorroMensual,
    slots_llenos: profile.slotsLlenos,
    capacidad: profile.capacidad,
    score: profile.score,
    proyectos: profile.proyectos,
    carril: profile.carril,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

/**
 * Fila -> `LeadProfile`. Pura: nunca toca la red. Tira (`throw`) si una
 * columna jsonb/enum no cumple su schema — una fila corrupta es un fallo de
 * infraestructura, no un `ValidationError` de negocio (design.md D10).
 */
export function toDomain(row: SupabaseLeadRow): LeadProfile {
  return {
    id: row.id,
    consentimiento:
      row.consentimiento === null ? null : ConsentimientoSchema.parse(row.consentimiento),
    esAfiliado: row.es_afiliado,
    rangoSalarial: row.rango_salarial,
    segmento: SegmentoSchema.parse(row.segmento),
    personasACargo: row.personas_a_cargo,
    ciudad: row.ciudad,
    segmentoFamiliar: row.segmento_familiar,
    ahorroDeclarado: row.ahorro_declarado,
    capacidadAhorroMensual: row.capacidad_ahorro_mensual,
    slotsLlenos: z.array(SlotSchema).parse(row.slots_llenos),
    capacidad: row.capacidad === null ? null : CapacidadSchema.parse(row.capacidad),
    score: row.score === null ? null : ScoreSchema.parse(row.score),
    proyectos: row.proyectos === null ? [] : ProyectosSchema.parse(row.proyectos),
    carril: CarrilSchema.parse(row.carril),
    // timestamptz vuelve como "...+00:00"; el contrato pide ISO-8601 con "Z"
    // (design.md D10 regla 1).
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Tipado minimo del esquema Postgrest, escrito a mano (sin `supabase gen
 * types`, que no corre en este scaffolding). Le da a `.from(TABLA)` los tipos
 * `Row`/`Insert` correctos sin pasar por `any`.
 */
interface Database {
  public: {
    Tables: {
      lead_profiles: {
        Row: LeadProfilesRow;
        Insert: LeadProfilesRow;
        Update: Partial<LeadProfilesRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

export class SupabaseLeadRepository implements LeadRepository {
  private readonly client: SupabaseClient<Database>;

  constructor(url: string, serviceRoleKey: string) {
    // Proceso de servidor: no hay sesion de usuario que persistir ni refrescar
    // (design.md D10). Sin singleton a nivel de modulo: cada instancia es
    // duena de su propio cliente.
    this.client = createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async save(profile: LeadProfile): Promise<Result<LeadProfile>> {
    const respuesta = await this.client.from(TABLA).upsert(toRow(profile)).select().single();

    if (respuesta.error !== null) {
      throw new Error(`SupabaseLeadRepository.save fallo: ${respuesta.error.message}`);
    }

    return ok(toDomain(respuesta.data));
  }

  async findById(id: string): Promise<Result<LeadProfile>> {
    const respuesta = await this.client.from(TABLA).select().eq('id', id).maybeSingle();

    if (respuesta.error !== null) {
      throw new Error(`SupabaseLeadRepository.findById fallo: ${respuesta.error.message}`);
    }
    if (respuesta.data === null) {
      // Mismo mensaje que `InMemoryLeadRepository`: la superficie HTTP no
      // cambia con el driver.
      return err(new NotFoundError('Lead no encontrado'));
    }

    return ok(toDomain(respuesta.data));
  }

  /* eslint-disable @typescript-eslint/no-unused-vars --
     Convencion de scaffolding del repo (ver in-memory-lead.repository.ts):
     parametro con prefijo `_` = "el cuerpo todavia es un stub". El lint de
     parametros no usados queda apagado solo en estos 3 stubs, igual que en
     el adapter en memoria, para no fingir una firma distinta a la del puerto. */

  /**
   * TODO(F2.1): sin tabla `enriched_leads` todavia. Mismo stub que
   * `InMemoryLeadRepository` — fuera de alcance de F1 (design.md D10).
   */
  saveEnriched(_lead: EnrichedLead): Promise<Result<EnrichedLead>> {
    throw new Error('TODO: not implemented');
  }

  findEnrichedById(_id: string): Promise<Result<EnrichedLead>> {
    throw new Error('TODO: not implemented');
  }

  /** TODO(F3): filtrar, ordenar y paginar es logica de negocio de F3, no de este adapter. */
  listViable(
    _filters: LeadListFilters,
    _sort: LeadListSort,
    _pagina: number,
    _porPagina: number,
  ): Promise<Result<LeadListPage>> {
    throw new Error('TODO: not implemented');
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
