/**
 * Fabrica del `LeadRepository`. Capa: infrastructure.
 * Espeja `llm.factory.ts` (design.md D10): un solo lugar decide que driver de
 * persistencia se usa, para que ninguna feature importe un adapter concreto y
 * el cambio de driver sea una variable de entorno.
 */

import type { EducationJourneyRepository } from '../../application/ports/education-repository.port.js';
import type { LeadRepository } from '../../application/ports/lead-repository.port.js';
import type { AppEnv } from '../config/env.js';
import { InMemoryEducationRepository } from './in-memory/in-memory-education.repository.js';
import { InMemoryLeadRepository } from './in-memory/in-memory-lead.repository.js';
import type { AppSupabaseClient } from './supabase/supabase-client.js';
import { createSupabaseClient } from './supabase/supabase-client.js';
import { SupabaseEducationRepository } from './supabase/supabase-education.repository.js';
import { SupabaseLeadRepository } from './supabase/supabase-lead.repository.js';

/**
 * Construye el cliente de Supabase solo cuando el driver lo pide y las
 * credenciales estan completas. `loadEnv` ya valida esto; el chequeo se
 * repite porque un repositorio mal construido falla en el primer `/consent`,
 * delante del jurado.
 */
function requireSupabaseClient(env: AppEnv): AppSupabaseClient {
  if (env.supabaseUrl === null || env.supabaseServiceRoleKey === null) {
    throw new Error('PERSISTENCE_DRIVER=supabase exige SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  }
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);
}

export function createLeadRepository(env: AppEnv): LeadRepository {
  if (env.persistenceDriver === 'supabase') {
    return new SupabaseLeadRepository(requireSupabaseClient(env));
  }

  // Default deliberado: sin credenciales el proyecto igual corre de punta a punta.
  return new InMemoryLeadRepository();
}

/**
 * F2.2: antes de esta factory, el journey gamificado SOLO vivia en memoria
 * (`InMemoryEducationRepository`), sin importar `PERSISTENCE_DRIVER` — un
 * lead perdia todo su progreso en cada restart del backend. Mismo criterio de
 * seleccion que `createLeadRepository`, puerto separado (F4 lo comparte).
 */
export function createEducationRepository(env: AppEnv): EducationJourneyRepository {
  if (env.persistenceDriver === 'supabase') {
    return new SupabaseEducationRepository(requireSupabaseClient(env));
  }

  return new InMemoryEducationRepository();
}
