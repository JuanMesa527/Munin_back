import { readFileSync } from 'node:fs';
import { EducationJourneyPayloadSchema } from '../src/shared/infrastructure/persistence/education-payload.codec.js';

const env = Object.fromEntries(
  readFileSync('/Users/bryanriano/Desktop/munin/Munin_back/.env', 'utf8')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const r = await fetch(`${env.SUPABASE_URL}/rest/v1/education_journeys?select=lead_id,journey_payload`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
});
console.log('status', r.status);
const rows = await r.json() as { lead_id: string; journey_payload: unknown }[];
if (!Array.isArray(rows)) { console.log(rows); process.exit(0); }
console.log('filas journey:', rows.length);
let ok = 0;
for (const row of rows) {
  const p = EducationJourneyPayloadSchema.safeParse(row.journey_payload);
  if (p.success) { ok++; continue; }
  console.log(`\n--- FALLA ${row.lead_id} ---`);
  for (const i of p.error.issues.slice(0, 10)) console.log('   ', i.path.join('.'), ':', i.message);
}
console.log('\nparsean OK:', ok, '/', rows.length);
console.log('journey del lead objetivo:', rows.some(r => r.lead_id === '326dc0b4-596d-4f0c-bade-dbe490901ad2') ? 'EXISTE' : 'no hay');
