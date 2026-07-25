# F2.1 → F3/F4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir los leads enriquecidos por F2.1 y exponer la lista F3, el briefing F4 y el revelado auditado que ya consume el frontend.

**Architecture:** `app.ts` selecciona adapters de memoria o Supabase y entrega el mismo `LeadRepository` a F2.1, F3 y F4. Los módulos closer separan autenticación, casos de uso y HTTP; las decisiones de score y matching permanecen deterministas.

**Tech Stack:** Node.js 22, TypeScript 5.9, Express 5, Zod 4, Vitest 4, Supabase/Postgres, React Query en el frontend.

## Global Constraints

- `src/shared/contracts.ts` del backend es la única fuente de verdad; la copia frontend se genera con `npm run contracts:sync`.
- No registrar nombres, teléfonos, cookies, contraseñas ni cuerpos con PII.
- El LLM puede redactar, pero no calcular score, carril ni matching.
- Las rutas closer requieren cookie `httpOnly`, `SameSite=Strict` y `Secure` en producción.
- F1, F2.2, cambios visuales e integración de telefonía quedan fuera.
- No crear commits automáticamente; el usuario no los solicitó.

---

## Mapa de archivos

- `src/shared/contracts.ts`: DTO compartido y rutas.
- `src/features/lead-enrichment/domain/{matching,swipes}.ts`: completar salida A8/A9/A10.
- `src/features/closer-dashboard/`: autenticación, ranking, listado y HTTP de F3.
- `src/features/closer-briefing/`: construcción de briefing, reveal y HTTP de F4.
- `src/shared/infrastructure/persistence/{in-memory,supabase}/`: adapters equivalentes de leads.
- `supabase/migrations/0002_lead_profiles.sql`: persistencia durable de perfiles enriquecidos.
- `src/app.ts`: composición y montaje.
- `perfilador-vivienda-frontend/src/shared/contracts.ts`: archivo generado, nunca editado a mano.
- `perfilador-vivienda-frontend/.env`: `VITE_DEMO_MODE=false` solo para verificación local; no se versiona.

### Task 1: Reparar contratos y salida de F2.1

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/features/lead-enrichment/domain/matching.ts`
- Modify: `src/features/lead-enrichment/domain/swipes.ts`
- Modify: `src/features/lead-enrichment/domain/matching.test.ts`
- Modify: `src/features/lead-enrichment/domain/swipes.test.ts`

**Interfaces:**
- Produces: `ProjectMatchCard`, `EnrichmentDeck`, `SwipeAction`, `SwipeEvent`, `ViewEvent`, `EnrichmentSessionSummary`, `EnrichmentTelemetry`, `EnrichmentSummary`.
- Produces: `ProjectMatch` con datos renderizables y `EnrichedLead` completo.

- [ ] **Step 1: Escribir pruebas fallidas para los campos exigidos**

```ts
expect(card.match).toMatchObject({
  proyectoId: card.ficha.proyectoId,
  nombre: card.ficha.nombre,
  etapa: expect.any(String),
  precioDesde: card.ficha.precio.desde,
  tipologia: expect.any(String),
});
expect(card.factores.every((factor) => factor.intensidad >= 0 && factor.intensidad <= 100)).toBe(true);
expect(enriched).toMatchObject({
  edad: expect.anything(),
  ocupacion: expect.anything(),
  hogar: expect.anything(),
  contactabilidad: expect.any(Array),
  timeline: expect.any(Array),
});
```

- [ ] **Step 2: Ejecutar las suites y comprobar el fallo**

Run: `npm test -- src/features/lead-enrichment/domain/matching.test.ts src/features/lead-enrichment/domain/swipes.test.ts`

Expected: FAIL por campos faltantes o tipos no exportados.

- [ ] **Step 3: Añadir los DTO exactamente donde comienza la sección F2.1**

```ts
export type SwipeAction = 'pass' | 'like' | 'favorito';

export interface ProjectMatchCard {
  ficha: ProjectCard;
  match: ProjectMatch;
  factores: Factor[];
  cabeEnCapacidad: boolean;
}

export interface EnrichmentDeck {
  leadId: string;
  tarjetas: ProjectMatchCard[];
  catalogoVersion: string;
  generadoEn: IsoDateTime;
}

export interface SwipeEvent {
  leadId: string;
  proyectoId: string;
  accion: SwipeAction;
  decididoEn: IsoDateTime;
  dwellMs: number | null;
  abrioDetalle: boolean;
  detalleMs: number | null;
}

export interface ViewEvent {
  leadId: string;
  proyectoId: string | null;
  seccion: string;
  dwellMs: number;
  ocurridoEn: IsoDateTime;
}

export interface EnrichmentSessionSummary {
  leadId: string;
  startedAt: IsoDateTime;
  endedAt: IsoDateTime;
  totalTarjetas: number;
  decididas: number;
  likes: number;
  favoritos: number;
  passes: number;
  intentScore: number;
  tiempoTotalMs: number;
}

export interface EnrichmentTelemetry {
  views: ViewEvent[];
  session: EnrichmentSessionSummary;
}

export interface EnrichmentSummary {
  lead: EnrichedLead;
  guardados: ProjectCard[];
  swipes: SwipeEvent[];
}
```

- [ ] **Step 4: Completar los mappers de dominio con valores derivados o `null`, sin inventar decisiones**

`ProjectMatch` toma nombre, precio y tipología de `ProjectCard`; `Factor.intensidad` se normaliza a 0–100. Los campos A8 no disponibles en el perfil base se conservan como `null` o arreglos vacíos.

- [ ] **Step 5: Verificar la tarea**

Run: `npm run typecheck && npm test`

Expected: PASS en typecheck y suites F2.1.

### Task 2: Implementar ranking y listado F3 en memoria

**Files:**
- Create: `src/features/closer-dashboard/domain/lead-ranking.ts`
- Create: `src/features/closer-dashboard/domain/lead-ranking.test.ts`
- Create: `src/features/closer-dashboard/application/list-viable-leads.use-case.ts`
- Create: `src/features/closer-dashboard/application/list-viable-leads.use-case.test.ts`
- Modify: `src/shared/infrastructure/persistence/in-memory/in-memory-lead.repository.ts`
- Create: `src/shared/infrastructure/persistence/in-memory/in-memory-lead.repository.test.ts`

**Interfaces:**
- Produces: `toViableLeadListItem(lead: EnrichedLead): ViableLeadListItem`.
- Produces: `rankAndPageViableLeads(leads, filters, sort, pagina, porPagina): LeadListPage`.
- Produces: `ListViableLeadsUseCase.execute(input): Promise<Result<LeadListPage>>`.

- [ ] **Step 1: Escribir pruebas de exclusión, filtros, orden y paginación**

```ts
expect(page.items.every((item) => item.score >= 70)).toBe(true);
expect(page.items.map((item) => item.leadId)).toEqual(['intent-90', 'intent-60']);
expect(page).toMatchObject({ total: 3, pagina: 2, porPagina: 1 });
expect(page.items).toHaveLength(1);
```

- [ ] **Step 2: Ejecutar y confirmar que fallan**

Run: `npm test -- src/features/closer-dashboard src/shared/infrastructure/persistence/in-memory/in-memory-lead.repository.test.ts`

Expected: FAIL porque los módulos aún no existen.

- [ ] **Step 3: Implementar funciones puras de ranking**

Aplicar `soloAfiliados`, `soloNutridos`, `segmento`, `ciudad`, `scoreMinimo` y `banda`; ignorar `busqueda` en servidor. Ordenar con desempate estable por `actualizadoEn` y `leadId`.

- [ ] **Step 4: Completar el repositorio en memoria**

`listViable` debe delegar al ranking puro sobre copias defensivas de `enriquecidos`; no debe duplicar reglas.

- [ ] **Step 5: Implementar el caso de uso**

```ts
export class ListViableLeadsUseCase {
  constructor(private readonly leads: LeadRepository) {}

  execute(input: {
    filters: LeadListFilters;
    sort: LeadListSort;
    pagina: number;
    porPagina: number;
  }): Promise<Result<LeadListPage>> {
    return this.leads.listViable(input.filters, input.sort, input.pagina, input.porPagina);
  }
}
```

- [ ] **Step 6: Verificar la tarea**

Run: `npm test -- src/features/closer-dashboard src/shared/infrastructure/persistence/in-memory/in-memory-lead.repository.test.ts`

Expected: PASS.

### Task 3: Añadir persistencia de leads en Supabase

**Files:**
- Create: `supabase/migrations/0002_lead_profiles.sql`
- Modify: `src/shared/infrastructure/persistence/supabase/database.types.ts`
- Create: `src/shared/infrastructure/persistence/supabase/supabase-lead.repository.ts`
- Create: `src/shared/infrastructure/persistence/supabase/supabase-lead.repository.test.ts`

**Interfaces:**
- Produces: `SupabaseLeadRepository implements LeadRepository`.
- Consumes: funciones puras de ranking de Task 2.

- [ ] **Step 1: Escribir pruebas con cliente Supabase simulado**

```ts
await repository.saveEnriched(enrichedLead);
expect(client.from).toHaveBeenCalledWith('lead_profiles');
expect(upsert).toHaveBeenCalledWith(
  expect.objectContaining({ lead_id: enrichedLead.id, enriched_payload: enrichedLead }),
  { onConflict: 'lead_id' },
);
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test -- src/shared/infrastructure/persistence/supabase/supabase-lead.repository.test.ts`

Expected: FAIL porque el adapter no existe.

- [ ] **Step 3: Crear migración idempotente y RLS cerrado**

```sql
create table if not exists public.lead_profiles (
  lead_id text primary key,
  base_payload jsonb not null,
  enriched_payload jsonb,
  carril text,
  score integer,
  intent_score integer,
  updated_at timestamptz not null default now()
);
create index if not exists lead_profiles_queue_idx
  on public.lead_profiles (carril, score desc, intent_score desc, updated_at desc);
alter table public.lead_profiles enable row level security;
```

- [ ] **Step 4: Implementar save/find/list con errores tipados**

Las lecturas convierten `null` de Supabase a `NotFoundError`; fallos del cliente se convierten a `InfrastructureError` sin incluir payloads ni credenciales.

- [ ] **Step 5: Verificar contrato equivalente con memoria**

Run: `npm test -- src/shared/infrastructure/persistence`

Expected: ambas implementaciones pasan las mismas expectativas de guardado, lectura y listado.

### Task 4: Implementar autenticación closer

**Files:**
- Modify: `src/shared/infrastructure/config/env.ts`
- Modify: `.env.example`
- Create: `src/features/closer-dashboard/infrastructure/env-closer-auth.adapter.ts`
- Create: `src/features/closer-dashboard/infrastructure/env-closer-auth.adapter.test.ts`
- Create: `src/features/closer-dashboard/interface/closer-auth.dto.ts`
- Create: `src/features/closer-dashboard/interface/closer-auth.controller.ts`
- Create: `src/features/closer-dashboard/interface/require-closer.ts`
- Create: `src/features/closer-dashboard/interface/closer-auth.controller.test.ts`

**Interfaces:**
- Produces: `EnvCloserAuthAdapter implements CloserAuthPort`.
- Produces: `createRequireCloser(sessionStore): RequestHandler`.
- Produces: `res.locals.closer: CloserSession`.

- [ ] **Step 1: Añadir pruebas de credenciales, cookie, expiración y logout**

```ts
expect(response.headers['set-cookie'][0]).toContain('closer_session=');
expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict');
expect(unauthenticated.status).toBe(401);
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test -- src/features/closer-dashboard/interface/closer-auth.controller.test.ts`

Expected: FAIL porque no existen controller ni middleware.

- [ ] **Step 3: Añadir configuración de credenciales de demo**

Agregar `CLOSER_USERNAME` y `CLOSER_PASSWORD` a `AppEnv`. Exigir contraseña no vacía siempre y mínimo 12 caracteres en producción. Comparar credenciales con `timingSafeEqual`; devolver el mismo `UnauthorizedError` para usuario o contraseña incorrectos.

- [ ] **Step 4: Implementar cookie y middleware**

Nombre fijo: `closer_session`. Login emite token con `InMemorySessionStore.issue`; logout revoca y limpia; session/guard verifican el token. El body nunca devuelve el token.

- [ ] **Step 5: Verificar la tarea**

Run: `npm test -- src/features/closer-dashboard`

Expected: PASS.

### Task 5: Exponer la lista F3 por HTTP

**Files:**
- Create: `src/features/closer-dashboard/interface/closer-leads.dto.ts`
- Create: `src/features/closer-dashboard/interface/closer-leads.controller.ts`
- Create: `src/features/closer-dashboard/interface/closer-leads.controller.test.ts`
- Create: `src/features/closer-dashboard/closer-dashboard.module.ts`

**Interfaces:**
- Produces: `createCloserDashboardModule(deps): { publicRouter; protectedRouter; requireCloser }`.

- [ ] **Step 1: Escribir prueba HTTP del contrato esperado por el frontend**

```ts
expect(response.status).toBe(200);
expect(response.body).toEqual({
  ok: true,
  data: expect.objectContaining({
    items: expect.any(Array),
    total: expect.any(Number),
    pagina: 1,
    porPagina: 20,
  }),
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test -- src/features/closer-dashboard/interface/closer-leads.controller.test.ts`

Expected: FAIL porque la ruta no existe.

- [ ] **Step 3: Validar query con Zod**

Defaults: `sort=score_desc`, `pagina=1`, `porPagina=20`; máximo `porPagina=100`. Transformar booleanos de query explícitamente y rechazar valores desconocidos.

- [ ] **Step 4: Montar auth y listado**

El router público solo contiene login. El router protegido contiene logout, session y `GET API_ROUTES.closer.leads`; todas las respuestas usan `sendOk`.

- [ ] **Step 5: Verificar la tarea**

Run: `npm test -- src/features/closer-dashboard`

Expected: PASS.

### Task 6: Construir y exponer F4

**Files:**
- Create: `src/features/closer-briefing/application/build-briefing.use-case.ts`
- Create: `src/features/closer-briefing/application/build-briefing.use-case.test.ts`
- Create: `src/features/closer-briefing/application/reveal-contact.use-case.ts`
- Create: `src/features/closer-briefing/application/reveal-contact.use-case.test.ts`
- Create: `src/features/closer-briefing/interface/closer-briefing.controller.ts`
- Create: `src/features/closer-briefing/interface/closer-briefing.controller.test.ts`
- Create: `src/features/closer-briefing/closer-briefing.module.ts`

**Interfaces:**
- Produces: `BuildBriefingUseCase.execute(leadId): Promise<Result<BriefingSheet>>`.
- Produces: `RevealContactUseCase.execute({ leadId, closerId }): Promise<Result<{ telefono: string }>>`.

- [ ] **Step 1: Escribir pruebas de briefing determinista**

```ts
expect(sheet.lead.id).toBe(lead.id);
expect(sheet.talkingPoints.length).toBeGreaterThan(0);
expect(sheet.resumenScore).toContain(String(lead.score.valor));
expect(sheet.alertas).not.toContain(expect.stringMatching(/telefono/i));
```

- [ ] **Step 2: Escribir prueba de reveal auditado**

```ts
const result = await useCase.execute({ leadId: lead.id, closerId: 'closer-1' });
expect(result.ok).toBe(true);
expect(vault.revealForCall).toHaveBeenCalledWith(
  lead.identidad?.contactoTokenId,
  'closer-1',
);
```

- [ ] **Step 3: Ejecutar y confirmar los fallos**

Run: `npm test -- src/features/closer-briefing`

Expected: FAIL porque los casos de uso no existen.

- [ ] **Step 4: Implementar briefing sin decisiones LLM**

Construir talking points y objeciones desde factores, matches, capacidad e intereses. Si no existe journey, devolver `journey: null`. Usar texto determinista con el stub; una futura redacción LLM recibe únicamente factores no sensibles.

- [ ] **Step 5: Implementar reveal**

Leer el lead, exigir `identidad`, tomar `contactoTokenId` y delegar en el vault con el `closerId` de `res.locals`, nunca del body.

- [ ] **Step 6: Exponer rutas protegidas**

`GET ${API_ROUTES.closer.briefing}/:leadId` y `POST API_ROUTES.closer.revealContact`.

- [ ] **Step 7: Verificar la tarea**

Run: `npm test -- src/features/closer-briefing`

Expected: PASS.

### Task 7: Integrar módulos y adapters en `app.ts`

**Files:**
- Modify: `src/app.ts`
- Create: `src/app.test.ts`
- Modify: `src/shared/infrastructure/persistence/demo-seed.ts`

**Interfaces:**
- Consumes: módulos F2.1, F3 y F4 y sus adapters.
- Produces: servidor Express completo desde `createApp(env)`.

- [ ] **Step 1: Escribir prueba end-to-end en memoria**

```ts
// Login → summary F2.1 → lista F3 → briefing F4
expect(login.status).toBe(200);
expect(summary.body.ok).toBe(true);
expect(list.body.data.items.some((item: { leadId: string }) => item.leadId === leadId)).toBe(true);
expect(briefing.body.data.lead.id).toBe(leadId);
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test -- src/app.test.ts`

Expected: FAIL porque F3/F4 no están montados.

- [ ] **Step 3: Seleccionar repositorio junto con swipes/telemetría**

Con driver Supabase, crear un único cliente y reutilizarlo en `SupabaseLeadRepository`, `SupabaseSwipeStore` y `SupabaseTelemetryStore`. Con memoria, usar `InMemoryLeadRepository`.

- [ ] **Step 4: Construir dependencias compartidas**

Instanciar clock, ids, audit, vault, education repository, session store y auth adapter. Sembrar leads/contactos demo únicamente fuera de producción.

- [ ] **Step 5: Montar rutas en orden**

Health → F2.1 con `publicRateLimiter` → login con `authRateLimiter` → F3/F4 con `requireCloser` → not found → error handler.

- [ ] **Step 6: Verificar memoria**

Run: `npm test -- src/app.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 7: Aplicar migración y verificar Supabase**

Aplicar `0002_lead_profiles.sql` en el proyecto Supabase configurado y ejecutar una prueba manual de persistencia con `PERSISTENCE_DRIVER=supabase`.

Expected: el lead sigue apareciendo después de reiniciar el backend.

### Task 8: Sincronizar frontend y verificar el flujo completo

**Files:**
- Generated: `../perfilador-vivienda-frontend/src/shared/contracts.ts`
- Local only: `../perfilador-vivienda-frontend/.env`

**Interfaces:**
- Produces: frontend compilado contra exactamente los mismos DTO del backend.

- [ ] **Step 1: Sincronizar contrato**

Run: `npm run contracts:sync`

Expected: la copia frontend cambia y `npm run contracts:check` pasa.

- [ ] **Step 2: Verificar backend completo**

Run: `npm run verify && npm run build`

Expected: todos los comandos terminan con código 0.

- [ ] **Step 3: Verificar frontend**

Run desde `../perfilador-vivienda-frontend`: `npm run verify`

Expected: typecheck, lint, tests y build pasan.

- [ ] **Step 4: Desactivar fallback solo en el entorno local**

```dotenv
VITE_API_BASE_URL=
VITE_DEMO_MODE=false
```

- [ ] **Step 5: Probar el recorrido real**

1. Cerrar enrichment para un lead demo mediante `POST /api/leads/enrichment/summary`.
2. Iniciar sesión en `/closer/login`.
3. Confirmar que el lead aparece en `/closer`.
4. Abrir `/closer/leads/:leadId`.
5. Revelar contacto y comprobar un evento `revelar_contacto` sin teléfono en logs.

Expected: F2.1 → F3 → F4 funciona sin usar `SEED_LIST_ITEMS` ni `SEED_BRIEFINGS`.
