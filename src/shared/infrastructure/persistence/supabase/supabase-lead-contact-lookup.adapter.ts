import type {
  LeadContactInput,
  LeadContactLookupPort,
} from '../../../application/ports/lead-contact-lookup.port.js';
import { InfrastructureError, NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';
import { logger } from '../../logging/logger.js';
import type { AppSupabaseClient } from './supabase-client.js';

const TABLE = 'lead_profiles';

/** Mismo criterio de sanitizado que `supabase-lead.repository.ts`: solo `code`/`message`. */
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

function unavailable(mensaje: string, operacion: string, causa: unknown): Result<never> {
  logger.error(
    { operacion, tabla: TABLE, supabase: resumirCausa(causa) },
    'fallo el acceso a Supabase',
  );
  return err(new InfrastructureError(mensaje));
}

/**
 * Resuelve telefono/email -> `lead_id` contra las columnas denormalizadas
 * (`0002_lead_profiles.sql` + `..._lead_profiles_contact_columns.sql`), NO
 * contra `base_payload`: filtrar sobre jsonb sin indice no escala y ya existe
 * la columna escalar para esto (mismo criterio que `carril`/`score`).
 */
export class SupabaseLeadContactLookup implements LeadContactLookupPort {
  constructor(private readonly client: AppSupabaseClient) {}

  async findLeadIdByContact(contact: LeadContactInput): Promise<Result<string>> {
    const columna = contact.telefono !== null ? 'telefono' : 'email';
    const valor = contact.telefono ?? contact.email;
    if (valor === null) {
      return err(new NotFoundError('No existe un lead con ese contacto'));
    }

    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('lead_id')
        .eq(columna, valor)
        .maybeSingle();

      if (error) {
        return unavailable('No se pudo resolver el contacto', 'findLeadIdByContact', error);
      }
      if (data === null) {
        return err(new NotFoundError('No existe un lead con ese contacto'));
      }
      return ok(data.lead_id);
    } catch (error) {
      return unavailable('No se pudo resolver el contacto', 'findLeadIdByContact', error);
    }
  }

  async findContactByLeadId(leadId: string): Promise<Result<LeadContactInput>> {
    try {
      const { data, error } = await this.client
        .from(TABLE)
        .select('email, telefono')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (error) {
        return unavailable('No se pudo resolver el contacto', 'findContactByLeadId', error);
      }
      if (data === null) {
        return err(new NotFoundError('No existe un lead con ese id'));
      }
      return ok({ telefono: data.telefono, email: data.email });
    } catch (error) {
      return unavailable('No se pudo resolver el contacto', 'findContactByLeadId', error);
    }
  }
}
