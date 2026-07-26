import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('/Users/bryanriano/Desktop/munin/Munin_back/.env', 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const TABLAS = ['lead_profiles','education_journeys','call_sessions','contact_vault','lead_sessions','otp_codes','lead_otp','audit_log','audit_logs','enrichment_events'];
for (const t of TABLAS) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const body = await r.json().catch(() => null) as any;
  console.log(String(r.status).padEnd(4), t.padEnd(22), r.ok ? `OK (${Array.isArray(body) ? body.length : '?'} fila muestra)` : body?.code ?? '');
}
