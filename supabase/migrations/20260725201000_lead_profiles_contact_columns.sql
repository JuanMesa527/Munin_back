-- Denormaliza telefono/email de `base_payload` a columnas escalares, con el
-- mismo criterio que `carril`/`score`/`intent_score` (0002_lead_profiles.sql):
-- existen SOLO para filtrar, no como fuente de verdad. Las usa el login por
-- OTP del lead (F2.2, adenda A14) para resolver telefono/email -> lead_id sin
-- escanear el jsonb completo de cada fila.

alter table public.lead_profiles
  add column if not exists telefono text,
  add column if not exists email text;

create index if not exists lead_profiles_telefono_idx on public.lead_profiles (telefono);
create index if not exists lead_profiles_email_idx on public.lead_profiles (email);
