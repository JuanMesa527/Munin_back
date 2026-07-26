// Corre el schema REAL del repositorio contra los payloads reales de la base.
// Reproduce exactamente lo que hace findEnrichedById / listViable.
import { readFileSync } from 'node:fs';
import { EnrichedLeadPayloadSchema } from '../src/shared/infrastructure/persistence/lead-payload.codec.js';

const env = Object.fromEntries(
  readFileSync('/Users/bryanriano/Desktop/munin/Munin_back/.env', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const r = await fetch(
  `${env.SUPABASE_URL}/rest/v1/lead_profiles?select=lead_id,carril,enriched_payload`,
  {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  },
);
const rows = (await r.json()) as {
  lead_id: string;
  carril: string | null;
  enriched_payload: unknown;
}[];

let okCount = 0;
const fallos: { lead: string; carril: string | null; issues: string[] }[] = [];

for (const row of rows) {
  if (row.enriched_payload === null || row.enriched_payload === undefined) continue;
  const parsed = EnrichedLeadPayloadSchema.safeParse(row.enriched_payload);
  if (parsed.success) {
    okCount += 1;
    continue;
  }
  fallos.push({
    lead: row.lead_id,
    carril: row.carril,
    issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  });
}

console.log('con enriched_payload:', rows.filter((r) => r.enriched_payload).length);
console.log('parsean OK:', okCount);
console.log('FALLAN:', fallos.length);
for (const f of fallos) {
  console.log(`\n--- ${f.lead} (carril=${String(f.carril)}) ---`);
  for (const i of f.issues.slice(0, 8)) console.log('   ', i);
}
