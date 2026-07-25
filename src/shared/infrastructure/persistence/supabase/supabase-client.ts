/**
 * Cliente de Supabase para el backend. Capa: infrastructure.
 *
 * Se construye UNA vez en el composition root (`app.ts`) con el service role
 * key, que IGNORA RLS: por eso vive solo aqui y nunca cruza al frontend. Los
 * adapters de persistencia reciben este cliente ya listo; no leen `process.env`
 * ni saben de donde salio la credencial.
 *
 * `persistSession: false` porque el backend es sin estado: no hay un usuario
 * cuya sesion refrescar, solo la llave de servicio en cada request.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

export function createSupabaseClient(
  url: string,
  serviceRoleKey: string,
): ReturnType<typeof createClient<Database>> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'perfilador-vivienda-backend' } },
  });
}

/**
 * Tipo exacto del cliente que devuelve la factory. Los adapters lo usan como
 * tipo del parametro para no pelear con los generics internos de supabase-js
 * (anotar `SupabaseClient` "pelado" gatilla un no-unsafe-return por mismatch).
 */
export type AppSupabaseClient = ReturnType<typeof createSupabaseClient>;
