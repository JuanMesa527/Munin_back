-- Persistencia durable del puerto EducationJourneyRepository (F2.2).
-- Todo acceso ocurre desde el backend con service role. RLS queda habilitado
-- sin politicas para anon/authenticated, de modo que las claves publicas no
-- pueden leer ni modificar el progreso gamificado de un lead.

create table if not exists public.education_journeys (
  lead_id                text primary key,
  journey_payload        jsonb       not null,
  progreso               numeric,
  puntos_totales         integer,
  reclasificado_a_viable boolean,
  updated_at             timestamptz not null default now()
);

alter table public.education_journeys enable row level security;
