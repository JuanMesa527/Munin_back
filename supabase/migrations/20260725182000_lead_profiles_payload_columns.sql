-- Repara `lead_profiles` cuando la tabla ya existia con la forma legacy de F1.
--
-- POR QUE HIZO FALTA: `0002_lead_profiles.sql` crea la tabla con
-- `create table if not exists`. En un proyecto donde `lead_profiles` YA existia
-- con la forma vieja (una columna por campo: id, nombre, email, telefono...),
-- esa migracion no hizo nada y las columnas de payload nunca apareceieron. El
-- backend lo ve como PGRST204: "Could not find the 'base_payload' column of
-- 'lead_profiles' in the schema cache", y todo `/consent` responde 503.
--
-- Es ADITIVA E IDEMPOTENTE a proposito: no borra ni reescribe filas, y correrla
-- sobre una tabla ya correcta no cambia nada. Deja la tabla con la forma que
-- espera `SupabaseLeadRepository`.

-- 1. Las columnas que el repositorio escribe y lee.
--    Nullable salvo `updated_at`: si la tabla trae filas legacy, exigirles un
--    payload que nunca tuvieron las volveria ininsertables.
alter table public.lead_profiles
  add column if not exists lead_id          text,
  add column if not exists base_payload     jsonb,
  add column if not exists enriched_payload jsonb,
  add column if not exists carril           text,
  add column if not exists score            integer,
  add column if not exists intent_score     integer,
  add column if not exists updated_at       timestamptz not null default now();

-- 2. `save()` hace upsert con `onConflict: 'lead_id'`. Sin restriccion unica
--    sobre esa columna, PostgREST responde 42P10 y volvemos a un 503 mudo.
create unique index if not exists lead_profiles_lead_id_key
  on public.lead_profiles (lead_id);

-- 3. Filas legacy: su identificador vivia en `id`. Sin este backfill quedarian
--    con `lead_id` nulo, o sea invisibles para `findById`. Va en un bloque
--    dinamico porque `id` puede no existir, y Postgres valida las columnas al
--    parsear: un `update ... set lead_id = id` fallaria antes de evaluar
--    cualquier guarda.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'lead_profiles'
       and column_name = 'id'
  ) then
    execute 'update public.lead_profiles set lead_id = id where lead_id is null';
  end if;
end $$;

-- 4. Columnas legacy con NOT NULL: el repositorio de hoy no las escribe, asi
--    que cualquiera de ellas bloquearia el insert de un lead nuevo. Se les
--    quita la restriccion (siguen ahi, con sus datos, solo dejan de ser
--    obligatorias). Se excluyen las de la clave primaria: Postgres no permite
--    quitarles NOT NULL, y las tres que el repositorio si garantiza.
do $$
declare
  columna record;
begin
  for columna in
    select c.column_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'lead_profiles'
       and c.is_nullable = 'NO'
       and c.column_name not in ('lead_id', 'base_payload', 'updated_at')
       and c.column_name not in (
         select a.attname
           from pg_index i
           join pg_attribute a
             on a.attrelid = i.indrelid
            and a.attnum = any (i.indkey)
          where i.indrelid = 'public.lead_profiles'::regclass
            and i.indisprimary
       )
  loop
    execute format(
      'alter table public.lead_profiles alter column %I drop not null',
      columna.column_name
    );
  end loop;
end $$;

-- 5. RLS sigue activo y sin politicas: solo el service_role entra (0002).
alter table public.lead_profiles enable row level security;

-- 6. PostgREST cachea el esquema; sin esto el backend puede seguir viendo
--    PGRST204 hasta el proximo reinicio del proyecto.
notify pgrst, 'reload schema';
