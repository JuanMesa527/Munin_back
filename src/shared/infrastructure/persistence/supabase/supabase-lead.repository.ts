import type {
  EnrichedLead,
  LeadListFilters,
  LeadListPage,
  LeadListSort,
  LeadProfile,
} from '@contracts';
import { rankAndPageViableLeads } from '../../../../features/closer-dashboard/domain/lead-ranking.js';
import type { LeadRepository } from '../../../application/ports/lead-repository.port.js';
import { InfrastructureError, NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';
import { logger } from '../../logging/logger.js';
import {
  EnrichedLeadPayloadSchema,
  StoredLeadProfilePayloadSchema,
} from '../lead-payload.codec.js';
import type { AppSupabaseClient } from './supabase-client.js';

const TABLE = 'lead_profiles';

/**
 * De un fallo de Supabase se loguean SOLO `code` y `message`.
 *
 * `details` y `hint` de PostgREST pueden traer valores de la fila que provoco el
 * error, y esa fila es el `LeadProfile` completo: nombre, email y telefono del
 * titular. Meterlos en el log seria un tratamiento que nadie autorizo (Ley 1581,
 * la misma razon por la que el logger redacta PII).
 */
function resumirCausa(causa: unknown): { codigo: string | null; mensaje: string | null } {
  if (typeof causa !== 'object' || causa === null) {
    return { codigo: null, mensaje: null };
  }
  const { code, message } = causa as { code?: unknown; message?: unknown };
  return {
    codigo: typeof code === 'string' ? code : null,
    mensaje: typeof message === 'string' ? message : null,
  };
}

/** Resumen de un fallo de validacion: ruta y motivo, nunca el valor recibido. */
function causaDeSchema(error: {
  readonly issues: readonly { readonly path: PropertyKey[]; readonly message: string }[];
}): { code: string; message: string } {
  return {
    code: 'SCHEMA_INVALIDO',
    message: error.issues
      .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
      .join(' | '),
  };
}

/**
 * Devuelve el 503 Y DEJA CONSTANCIA DE LA CAUSA.
 *
 * Antes esta funcion se tragaba el error de Supabase entero: al cliente le
 * llegaba "No se pudo guardar el lead" y el log no decia por que, asi que un
 * despliegue con la tabla sin migrar y uno con la service_role key mala eran
 * indistinguibles desde afuera. El mensaje al cliente sigue siendo pobre a
 * proposito; el detalle vive del lado servidor (OWASP A09).
 */
function unavailable(mensaje: string, operacion: string, causa: unknown): Result<never> {
  logger.error(
    { operacion, tabla: TABLE, supabase: resumirCausa(causa) },
    'fallo el acceso a Supabase',
  );
  return err(new InfrastructureError(mensaje));
}

export class SupabaseLeadRepository implements LeadRepository {
  constructor(private readonly client: AppSupabaseClient) {}

  async save(profile: LeadProfile): Promise<Result<LeadProfile>> {
    const stored = structuredClone(profile);

    try {
      const { error } = await this.client.from(TABLE).upsert(
        {
          lead_id: stored.id,
          base_payload: stored,
          carril: stored.carril,
          score: stored.score?.valor ?? null,
          updated_at: stored.updatedAt,
        },
        { onConflict: 'lead_id' },
      );

      if (error) return unavailable('No se pudo guardar el lead', 'save', error);
      return ok(structuredClone(stored));
    } catch (error) {
      return unavailable('No se pudo guardar el lead', 'save', error);
    }
  }

  async findById(id: string): Promise<Result<LeadProfile>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('base_payload')
        .eq('lead_id', id)
        .maybeSingle();

      if (error) return unavailable('No se pudo leer el lead', 'findById', error);
      if (data === null) return err(new NotFoundError('Lead no encontrado'));
      const payload = StoredLeadProfilePayloadSchema.safeParse(data.base_payload);
      if (!payload.success) {
        return unavailable(
          'El lead almacenado tiene un formato invalido',
          'findById',
          causaDeSchema(payload.error),
        );
      }

      return ok(structuredClone(payload.data));
    } catch (error) {
      return unavailable('No se pudo leer el lead', 'findById', error);
    }
  }

  async saveEnriched(lead: EnrichedLead): Promise<Result<EnrichedLead>> {
    const stored = structuredClone(lead);

    try {
      const { error } = await this.client.from(TABLE).upsert(
        {
          lead_id: stored.id,
          base_payload: stored,
          enriched_payload: stored,
          carril: stored.carril,
          score: stored.score?.valor ?? null,
          intent_score: stored.intentScore,
          updated_at: stored.updatedAt,
        },
        { onConflict: 'lead_id' },
      );

      if (error) {
        return unavailable('No se pudo guardar el lead enriquecido', 'saveEnriched', error);
      }
      return ok(structuredClone(stored));
    } catch (error) {
      return unavailable('No se pudo guardar el lead enriquecido', 'saveEnriched', error);
    }
  }

  async findEnrichedById(id: string): Promise<Result<EnrichedLead>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('enriched_payload')
        .eq('lead_id', id)
        .maybeSingle();

      if (error) return unavailable('No se pudo leer el lead enriquecido', 'findEnrichedById', error);
      if (data?.enriched_payload === null || data === null) {
        return err(new NotFoundError('Lead enriquecido no encontrado'));
      }
      const payload = EnrichedLeadPayloadSchema.safeParse(data.enriched_payload);
      if (!payload.success) {
        return unavailable(
          'El lead enriquecido almacenado tiene un formato invalido',
          'findEnrichedById',
          causaDeSchema(payload.error),
        );
      }

      return ok(structuredClone(payload.data));
    } catch (error) {
      return unavailable('No se pudo leer el lead enriquecido', 'findEnrichedById', error);
    }
  }

  async listViable(
    filters: LeadListFilters,
    sort: LeadListSort,
    pagina: number,
    porPagina: number,
  ): Promise<Result<LeadListPage>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('enriched_payload')
        .eq('carril', 'viable');

      if (error) return unavailable('No se pudieron listar los leads viables', 'listViable', error);

      const leads: EnrichedLead[] = [];
      for (const row of data) {
        const payload = EnrichedLeadPayloadSchema.safeParse(row.enriched_payload);
        if (!payload.success) {
          return unavailable(
            'Un lead viable almacenado tiene un formato invalido',
            'listViable',
            causaDeSchema(payload.error),
          );
        }
        leads.push(structuredClone(payload.data));
      }

      return ok(rankAndPageViableLeads(leads, filters, sort, pagina, porPagina));
    } catch (error) {
      return unavailable('No se pudieron listar los leads viables', 'listViable', error);
    }
  }
}

/**
 * Forma legacy de F1, conservada solo para compatibilidad de mappers y tests.
 * El repositorio activo persiste los payloads completos del agregado
 * (`0002_lead_profiles.sql`: base_payload / enriched_payload jsonb).
 */
export interface SupabaseLeadRow {
  id: string;
  consentimiento: unknown;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  edad: number | null;
  estado_civil: string | null;
  es_afiliado: boolean | null;
  rango_salarial: string | null;
  segmento: string | null;
  personas_a_cargo: number | null;
  ciudad: string | null;
  segmento_familiar: string | null;
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

/** Mapper legacy puro; mantiene exactamente la fila esperada por F1. */
export function toRow(profile: LeadProfile): SupabaseLeadRow {
  return {
    id: profile.id,
    consentimiento: profile.consentimiento,
    nombre: profile.nombre,
    email: profile.email,
    telefono: profile.telefono,
    edad: profile.edad,
    estado_civil: profile.estadoCivil,
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

/** Mapper legacy puro, validado con el codec profundo actual del agregado. */
export function toDomain(row: SupabaseLeadRow): LeadProfile {
  return StoredLeadProfilePayloadSchema.parse({
    id: row.id,
    consentimiento: row.consentimiento,
    identidad: null,
    nombre: row.nombre,
    email: row.email,
    telefono: row.telefono,
    edad: row.edad,
    estadoCivil: row.estado_civil,
    esAfiliado: row.es_afiliado,
    rangoSalarial: row.rango_salarial,
    segmento: row.segmento,
    personasACargo: row.personas_a_cargo,
    ciudad: row.ciudad,
    segmentoFamiliar: row.segmento_familiar,
    ahorroDeclarado: row.ahorro_declarado,
    capacidadAhorroMensual: row.capacidad_ahorro_mensual,
    slotsLlenos: row.slots_llenos,
    capacidad: row.capacidad,
    score: row.score,
    proyectos: row.proyectos,
    carril: row.carril,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}
