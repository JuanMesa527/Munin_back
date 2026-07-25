import type { EducationJourney } from '@contracts';
import type { EducationJourneyRepository } from '../../../application/ports/education-repository.port.js';
import { InfrastructureError, NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';
import { logger } from '../../logging/logger.js';
import { EducationJourneyPayloadSchema } from '../education-payload.codec.js';
import type { AppSupabaseClient } from './supabase-client.js';

const TABLE = 'education_journeys';

/**
 * De un fallo de Supabase se loguean SOLO `code` y `message`, igual que en
 * `supabase-lead.repository.ts`: `details`/`hint` de PostgREST pueden traer
 * valores de la fila que provoco el error, y esa fila es el progreso completo
 * del journey de un lead (Ley 1581).
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
 * Devuelve el 503 Y DEJA CONSTANCIA DE LA CAUSA (mismo criterio que
 * `unavailable` en `supabase-lead.repository.ts`). El mensaje al cliente es
 * deliberadamente pobre; el detalle vive del lado servidor (OWASP A09).
 */
function unavailable(mensaje: string, operacion: string, causa: unknown): Result<never> {
  logger.error(
    { operacion, tabla: TABLE, supabase: resumirCausa(causa) },
    'fallo el acceso a Supabase',
  );
  return err(new InfrastructureError(mensaje));
}

export class SupabaseEducationRepository implements EducationJourneyRepository {
  constructor(private readonly client: AppSupabaseClient) {}

  async save(journey: EducationJourney): Promise<Result<EducationJourney>> {
    const stored = structuredClone(journey);

    try {
      const { error } = await this.client.from(TABLE).upsert(
        {
          lead_id: stored.leadId,
          journey_payload: stored,
          progreso: stored.progreso,
          puntos_totales: stored.puntosTotales,
          reclasificado_a_viable: stored.reclasificadoAViable,
          updated_at: stored.actualizadoEn,
        },
        { onConflict: 'lead_id' },
      );

      if (error) return unavailable('No se pudo guardar el plan de nutricion', 'save', error);
      return ok(structuredClone(stored));
    } catch (error) {
      return unavailable('No se pudo guardar el plan de nutricion', 'save', error);
    }
  }

  async findByLeadId(leadId: string): Promise<Result<EducationJourney>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('journey_payload')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (error) {
        return unavailable('No se pudo leer el plan de nutricion', 'findByLeadId', error);
      }
      if (data === null) {
        return err(new NotFoundError('Este lead no tiene un plan de nutricion'));
      }
      const payload = EducationJourneyPayloadSchema.safeParse(data.journey_payload);
      if (!payload.success) {
        return unavailable(
          'El plan de nutricion almacenado tiene un formato invalido',
          'findByLeadId',
          causaDeSchema(payload.error),
        );
      }

      return ok(structuredClone(payload.data));
    } catch (error) {
      return unavailable('No se pudo leer el plan de nutricion', 'findByLeadId', error);
    }
  }
}
