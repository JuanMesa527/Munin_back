-- Boveda de contacto persistente.
--
-- POR QUE HIZO FALTA: `InMemoryContactVaultAdapter` guarda el telefono real en
-- un Map del proceso. Con deploy automatico en cada push, cada despliegue
-- vaciaba la boveda: el lead conservaba su `contactoTokenId` dentro del payload
-- pero el token ya no resolvia, y "revelar contacto" respondia
-- "No hay un contacto asociado a ese token" para todo lead anterior al deploy.
--
-- Tabla propia y no una columna de `lead_profiles` a proposito: el telefono es
-- el dato mas sensible del sistema. Aislado tiene su propio RLS y se puede
-- borrar solo cuando el titular ejerce supresion (Ley 1581, art. 8 lit. e) sin
-- tocar el resto del perfil.

create table if not exists public.contact_vault (
  token_id   text primary key,
  telefono   text        not null,
  creado_en  timestamptz not null default now()
);

-- RLS activo y SIN politicas: igual que `lead_profiles`, solo el service_role
-- del backend entra. Las llaves publicas (anon) no pueden leer ni un registro.
alter table public.contact_vault enable row level security;

notify pgrst, 'reload schema';
