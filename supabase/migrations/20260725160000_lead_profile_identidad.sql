-- Identidad de contacto capturada en F1 (post-consentimiento).
-- El telefono se guarda normalizado (solo digitos); el closer lo revela
-- via ContactVaultPort, no desde este DTO plano en la consola.

alter table lead_profiles
  add column if not exists nombre text,
  add column if not exists email text,
  add column if not exists telefono text,
  add column if not exists edad integer,
  add column if not exists estado_civil text;
