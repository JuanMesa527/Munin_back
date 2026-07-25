-- Traslada la clave primaria de `lead_profiles` desde la columna legacy `id`
-- hacia `lead_id`, que es la que usa `SupabaseLeadRepository`.
--
-- POR QUE HIZO FALTA: la migracion anterior dejo la tabla con las columnas de
-- payload, pero `id` seguia siendo la PK legacy y por tanto NOT NULL. El
-- repositorio de hoy nunca escribe `id`, asi que cada insert moria con
-- 23502 "null value in column id violates not-null constraint" y `/consent`
-- respondia 503. `alter column id drop not null` no era opcion mientras `id`
-- fuera la clave primaria: Postgres lo rechaza.
--
-- NO SE BORRA NINGUNA COLUMNA NI NINGUNA FILA. `id` se queda donde esta, con
-- sus datos, solo deja de ser obligatoria y deja de ser la clave.

-- 1. Soltar la PK legacy. El nombre de la restriccion se busca en el catalogo
--    porque no es necesariamente `lead_profiles_pkey`: depende de como se creo
--    la tabla la primera vez.
do $$
declare
  nombre_pk text;
begin
  select con.conname
    into nombre_pk
    from pg_constraint con
   where con.conrelid = 'public.lead_profiles'::regclass
     and con.contype = 'p';

  -- Si ya es `lead_id`, esta migracion ya corrio: no hay nada que soltar.
  if nombre_pk is not null and not exists (
    select 1
      from pg_index i
      join pg_attribute a
        on a.attrelid = i.indrelid
       and a.attnum = any (i.indkey)
     where i.indrelid = 'public.lead_profiles'::regclass
       and i.indisprimary
       and a.attname = 'lead_id'
  ) then
    execute format('alter table public.lead_profiles drop constraint %I', nombre_pk);
  end if;
end $$;

-- 2. Ahora que `id` ya no es clave, se le puede quitar el NOT NULL. Se repite
--    el barrido de la migracion anterior: entonces `id` quedaba excluido por
--    ser PK, y era justo el que rompia los inserts.
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

-- 3. `lead_id` pasa a ser la clave primaria, reutilizando el indice unico que
--    creo la migracion anterior. Solo se intenta si no quedan filas con
--    `lead_id` nulo: si alguna quedo (una fila legacy sin `id` de donde
--    copiarlo), se prefiere dejar la tabla sin PK — el upsert sigue
--    funcionando contra el indice unico — antes que reventar la migracion.
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.lead_profiles'::regclass
       and contype = 'p'
  ) then
    return;
  end if;

  if exists (select 1 from public.lead_profiles where lead_id is null) then
    raise notice 'lead_profiles: hay filas con lead_id nulo; se deja sin PK y se conserva el indice unico';
    return;
  end if;

  alter table public.lead_profiles alter column lead_id set not null;

  if exists (
    select 1 from pg_class where relname = 'lead_profiles_lead_id_key' and relkind = 'i'
  ) then
    alter table public.lead_profiles
      add primary key using index lead_profiles_lead_id_key;
  else
    alter table public.lead_profiles add primary key (lead_id);
  end if;
end $$;

-- 4. PostgREST cachea el esquema: sin esto el backend puede seguir viendo la
--    forma vieja hasta el proximo reinicio del proyecto.
notify pgrst, 'reload schema';
