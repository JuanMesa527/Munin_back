-- Persistencia durable del puerto LeadRepository.
-- Todo acceso ocurre desde el backend con service role. RLS queda habilitado
-- sin politicas para anon/authenticated, de modo que las claves publicas no
-- pueden leer ni modificar perfiles.

create table if not exists public.lead_profiles (
  lead_id            text primary key,
  base_payload       jsonb       not null,
  enriched_payload   jsonb,
  carril              text,
  score               integer,
  intent_score        integer,
  updated_at          timestamptz not null default now()
);

create index if not exists lead_profiles_queue_idx
  on public.lead_profiles (
    carril,
    score desc,
    intent_score desc,
    updated_at desc
  );

alter table public.lead_profiles enable row level security;
