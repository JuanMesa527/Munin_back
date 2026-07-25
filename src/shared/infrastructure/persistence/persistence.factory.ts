/**
 * Fabrica del `LeadRepository`. Capa: infrastructure.
 * Espeja `llm.factory.ts` (design.md D10): un solo lugar decide que driver de
 * persistencia se usa, para que ninguna feature importe un adapter concreto y
 * el cambio de driver sea una variable de entorno.
 */

import type { LeadRepository } from '../../application/ports/lead-repository.port.js';
import type { AppEnv } from '../config/env.js';
import { InMemoryLeadRepository } from './in-memory/in-memory-lead.repository.js';
import { createSupabaseClient } from './supabase/supabase-client.js';
import { SupabaseLeadRepository } from './supabase/supabase-lead.repository.js';

export function createLeadRepository(env: AppEnv): LeadRepository {
  if (env.persistenceDriver === 'supabase') {
    if (env.supabaseUrl === null || env.supabaseServiceRoleKey === null) {
      // `loadEnv` ya valida esto; el chequeo se repite porque un repositorio
      // mal construido falla en el primer `/consent`, delante del jurado.
      throw new Error('PERSISTENCE_DRIVER=supabase exige SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    }
    const client = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    return new SupabaseLeadRepository(client);
  }

  // Default deliberado: sin credenciales el proyecto igual corre de punta a punta.
  return new InMemoryLeadRepository();
}
