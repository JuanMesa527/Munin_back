-- ============================================================================
--  0001_enrichment_persistence.sql
--  Perfilador de Vivienda · Colsubsidio × 30X
-- ----------------------------------------------------------------------------
--  Persistencia de F2.1 en Supabase:
--   - projects              : catalogo comercial (16 fichas + render en Storage)
--   - swipe_events          : el like/favorito del cliente que matchea vivienda
--   - view_events           : cuanto mira cada parte y si abre el detalle
--   - enrichment_sessions   : agregado por sesion (lo mas enriquecido posible)
--
--  Idempotente: se puede correr varias veces sin romper (IF NOT EXISTS +
--  DROP POLICY IF EXISTS). Aplicar en Supabase -> SQL Editor -> Run, o via
--  cualquier conexion con permisos DDL.
--
--  SEGURIDAD (Ley 1581 / OWASP A01): todo el acceso pasa por el backend con el
--  service role key, que IGNORA RLS. Se habilita RLS SIN politicas para anon:
--  ninguna clave publica puede leer ni escribir estas tablas. `lead_id` es text
--  (no FK a lead_profiles) a proposito: un lead de demo vive en memoria y aun
--  asi queremos su telemetria; un FK duro lo impediria.
-- ============================================================================

-- gen_random_uuid() vive en pgcrypto (habilitada por defecto en Supabase).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
--  projects — catalogo comercial (adenda A8 del contrato)
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  proyecto_id          text primary key,
  nombre               text        not null,
  ubicacion            text,
  ciudad               text,
  zona                 text,
  es_vis               boolean,
  descripcion          text,
  unidades             integer,
  torres               integer,
  pisos                text,
  area_desde           numeric,
  area_hasta           numeric,
  habitaciones_desde   integer,
  habitaciones_hasta   integer,
  tipologias           jsonb       not null default '[]'::jsonb,
  amenidades           jsonb       not null default '[]'::jsonb,
  lugares_cercanos     jsonb       not null default '[]'::jsonb,
  entrega              text,
  certificacion_edge   boolean,
  sala_de_ventas       text,
  brochure_url         text,
  -- ruta que sirve el front desde /public (offline-friendly para la demo)
  imagen               text,
  -- URL publica del mismo render ya subido a Supabase Storage
  imagen_url           text,
  precio               jsonb       not null,   -- PriceBand
  -- ficha completa (ProjectCard) para no perder fidelidad al des-normalizar
  ficha                jsonb       not null,
  catalogo_version     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.projects is
  'Catalogo comercial transcrito de brochures publicos (ProjectCard). Render en bucket project-renders.';

-- ----------------------------------------------------------------------------
--  swipe_events — la decision del cliente sobre cada vivienda (like/match)
-- ----------------------------------------------------------------------------
create table if not exists public.swipe_events (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              text        not null,
  proyecto_id          text        not null,
  accion               text        not null check (accion in ('pass','like','favorito')),
  -- por que se le mostro (glass-box, congelado al momento de decidir)
  similitud            numeric,
  razon                text,
  cabe_en_capacidad    boolean,
  factores             jsonb,
  -- telemetria de la tarjeta
  dwell_ms             integer,          -- cuanto miro la tarjeta antes de decidir
  abrio_detalle        boolean     not null default false,
  detalle_ms           integer,          -- cuanto tiempo en la vista de detalle
  decidido_en          timestamptz not null,
  created_at           timestamptz not null default now(),
  -- un swipe por (lead, proyecto): devolverse y recidir REEMPLAZA (upsert)
  unique (lead_id, proyecto_id)
);

create index if not exists swipe_events_lead_idx on public.swipe_events (lead_id);
create index if not exists swipe_events_proyecto_idx on public.swipe_events (proyecto_id);

comment on table public.swipe_events is
  'Decision del cliente sobre cada vivienda + telemetria de la tarjeta. Idempotente por (lead, proyecto).';

-- ----------------------------------------------------------------------------
--  view_events — tiempo en cada parte / si abre detalles (telemetria fina)
-- ----------------------------------------------------------------------------
create table if not exists public.view_events (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              text        not null,
  -- null cuando la seccion no es de un proyecto puntual (deck, resumen)
  proyecto_id          text,
  seccion              text        not null,   -- deck | card | detalle | factores | resumen
  dwell_ms             integer     not null,
  ocurrido_en          timestamptz not null,
  created_at           timestamptz not null default now()
);

create index if not exists view_events_lead_idx on public.view_events (lead_id);
create index if not exists view_events_seccion_idx on public.view_events (seccion);

comment on table public.view_events is
  'Cuanto tiempo mira el cliente cada parte de F2.1 y si abre el detalle.';

-- ----------------------------------------------------------------------------
--  enrichment_sessions — agregado por sesion de swipe
-- ----------------------------------------------------------------------------
create table if not exists public.enrichment_sessions (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              text        not null,
  started_at           timestamptz,
  ended_at             timestamptz,
  total_tarjetas       integer,
  decididas            integer,
  likes                integer,
  favoritos            integer,
  passes               integer,
  intent_score         integer,
  tiempo_total_ms      integer,
  user_agent           text,
  viewport             text,
  created_at           timestamptz not null default now()
);

create index if not exists enrichment_sessions_lead_idx on public.enrichment_sessions (lead_id);

comment on table public.enrichment_sessions is
  'Resumen agregado de una sesion de enriquecimiento (conteos, intencion, tiempo total).';

-- ----------------------------------------------------------------------------
--  RLS: encendido en todas, SIN politicas para anon. El backend usa service
--  role, que ignora RLS; ninguna clave publica toca estas tablas.
-- ----------------------------------------------------------------------------
alter table public.projects            enable row level security;
alter table public.swipe_events        enable row level security;
alter table public.view_events         enable row level security;
alter table public.enrichment_sessions enable row level security;
