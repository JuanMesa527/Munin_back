-- F5 call-simulation: registro historico de las llamadas de entrenamiento
-- (adenda A14). Una fila por llamada terminada.
--
-- Los objetos anidados del contrato (transcripcion, scorecard, highlights,
-- grabaciones) van como jsonb, mismo criterio que `lead_profiles`: el contrato
-- es la fuente de verdad de su forma y normalizarlo aqui obligaria a migrar la
-- tabla cada vez que cambie un campo del scorecard.
--
-- Las columnas sueltas (outcome, puntaje, interes_final, duracion) SI se
-- extraen del scorecard a proposito: son por las que se filtra y se agrega
-- ("¿como viene mejorando el equipo?"), y hacerlo sobre jsonb en cada consulta
-- es caro y no indexa bien.

create table if not exists call_sessions (
  id uuid primary key,
  lead_id uuid not null,
  dificultad text not null check (dificultad in ('receptivo', 'realista', 'dificil')),

  -- Denormalizado del scorecard, para consultar sin abrir el jsonb.
  outcome text not null check (outcome in ('agenda_visita', 'lo_piensa', 'no_cierra', 'colgo')),
  puntaje integer not null check (puntaje between 0 and 100),
  interes_final integer not null check (interes_final between 0 and 100),
  turnos integer not null default 0,
  duracion_segundos integer not null default 0,

  transcripcion jsonb not null default '[]',
  scorecard jsonb not null,
  -- `null` cuando el LLM no estaba disponible: la llamada se archiva igual.
  highlights jsonb,
  -- Punteros al bucket, nunca URLs publicas. Ver `CallRecordingRef`.
  grabaciones jsonb not null default '[]',

  iniciada_en timestamptz not null,
  terminada_en timestamptz not null,
  creado_en timestamptz not null default now()
);

-- La consulta natural es "las ultimas llamadas de este lead" y "las ultimas
-- del equipo": las dos ordenan por fecha descendente.
create index if not exists call_sessions_lead_id_idx on call_sessions (lead_id, terminada_en desc);
create index if not exists call_sessions_terminada_en_idx on call_sessions (terminada_en desc);

alter table call_sessions enable row level security;

-- Sin politicas, igual que `lead_profiles`: solo el backend con la
-- service_role key accede (bypassa RLS). El frontend nunca habla directo con
-- Supabase, y menos con la voz grabada de un empleado.


-- Bucket del audio. PRIVADO: son grabaciones de la voz de una persona real
-- (el comercial en entrenamiento; el lead es sintetico). Se sirven con URL
-- firmada y de corta vida, nunca con enlace publico.
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;
