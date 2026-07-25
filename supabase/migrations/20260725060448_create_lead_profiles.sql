-- F1 lead-intake: persistencia de LeadProfile.
-- Un solo aggregate; los objetos anidados del contrato (consentimiento,
-- capacidad, score, proyectos) se guardan como jsonb, igual que hace hoy
-- InMemoryLeadRepository con structuredClone. No incluye EnrichedLead
-- (F2.1, fuera de alcance de F1).

create table if not exists lead_profiles (
  id uuid primary key,
  consentimiento jsonb,
  nombre text,
  email text,
  telefono text,
  edad integer,
  estado_civil text,
  es_afiliado boolean,
  rango_salarial text,
  segmento text,
  personas_a_cargo integer,
  ciudad text,
  segmento_familiar text,
  ahorro_declarado bigint,
  capacidad_ahorro_mensual bigint,
  slots_llenos text[] not null default '{}',
  capacidad jsonb,
  score jsonb,
  proyectos jsonb not null default '[]',
  carril text check (carril in ('viable', 'no_viable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table lead_profiles enable row level security;

-- Sin políticas: solo el backend con la service_role key accede (bypassa
-- RLS). El frontend nunca habla directo con Supabase.
