# Design: F1 · lead-intake (cross-repo)

> **Canonical copy.** Mirror pointer: `Munin_front/openspec/changes/lead-intake/design.md`.
> Reads: `proposal.md`, `specs/lead-intake-{conversation,profiling,matching,routing,interface}`, `specs/app-bootstrap-back`.
> Size note: over the 800-word design budget on purpose — this artifact covers two repos and two composition roots in one change.
> **Amendment (post-review):** D10 (Supabase persistence adapter) and D11 (DeepSeek LLM provider) were added after the original design was reviewed, from infrastructure decisions the product owner confirmed mid-flow. D1–D9 are unchanged.

## Technical Approach

Backend is a single vertical slice: pure functions in `domain/`, two use-case classes in `application/`, one zod-validated Express router in `interface/`, wired by `lead-intake.module.ts`. `domain/` receives **every** dependency as a parameter (active policy version, `ScoringWeights`, `ProjectProfile[]`, `IsoDateTime`) — it imports only `@contracts`, `shared/kernel` and `shared/domain`. The LLM is reachable only from `application/`, through the existing 2-method `LlmPort`, and never on a decision path.

Frontend is a Feature-Sliced slice: `api/` (three `apiPost` calls via `API_ROUTES`), `model/` (one reducer hook + fixtures), `ui/` (presentational, composed from `@shared/ui`), `index.ts` exporting `LeadIntakeScreen` only. The screen never computes score, capacity or carril; it renders what `ConversationTurn` carries.

## Architecture Decisions

### D1 — `parseAnswer` stays pure; the LLM call moves to `application/`

| Option | Tradeoff | Decision |
|---|---|---|
| `parseAnswer(slot, texto, llm)` in `domain/` | Breaks "domain depends on nothing" and makes the fn async/impure | Rejected |
| `parseAnswer` pure + LLM in the use case | Two-step flow, but domain stays testable and LLM output is re-validated by the same pure parser | **Chosen** |

`parseAnswer(slot, texto)` is a deterministic vocabulary/format parser returning `Result<SlotValue, ValidationError>`. The use case tries it on the raw answer; on failure with free text it calls `llm.extractSlotValue(...)` and feeds the returned `valor` **back through `parseAnswer`**. This is exactly rule 22 ("validate LLM output before it enters the domain") expressed as code, and it is why the `StubLlmAdapter` (`valor: null, confianza: 0`) degrades to a re-ask instead of breaking the flow.

### D2 — Active policy version is a parameter, injected at the application layer

`hasConsent(profile: LeadProfile, activePolicyVersion: string): boolean`. `domain/` cannot read `env`; the use case constructor receives `activePolicyVersion` from `lead-intake.module.ts`, which reads `env.privacyPolicyVersion`. Rejected: a `PolicyVersionPort` (a port for a constant is ceremony) and a module-level singleton in domain (hidden global state, untestable). Call chain: `main.ts → loadEnv() → createApp(env) → createLeadIntakeModule(env) → new ProcessConversationTurnUseCase({ …, activePolicyVersion: env.privacyPolicyVersion }) → hasConsent(profile, this.deps.activePolicyVersion)`. The routing spec's `hasConsent(profile)` wording is refined here, not contradicted.

### D3 — `carril: null` is expressed as `routing: null`, not as a fabricated `RoutingDecision`

`RoutingDecision.carril` is non-nullable `Carril`, so DATA_UNAVAILABLE **cannot** be encoded inside it. Resolves proposal open question 1 with **zero** `contracts.ts` change:

| Field | Unclassified outcome |
|---|---|
| `profile.carril` | `null` |
| `profile.score` / `profile.capacidad` / `profile.proyectos` | `null` / `null` / `[]` |
| `ConversationTurn.routing` | `null` |
| `ConversationTurn.siguientePaso` | `null` (terminal) |
| `ConversationTurn.mensajes` | one honest closing `BotMessage` |
| Persistence | same `LeadRepository.save` path as the other two carriles |

Terminal state is therefore `siguientePaso === null`, and the three outcomes are distinguished by `routing`.

### D4 — `decideViability` returns `RoutingDecision | null`

`null` iff `score === null || capacidad === null` — "no evidence, no decision" lives in one testable pure function. The use case already knows it lacks a score, but the defensive `null` makes it impossible for a future caller to get a decision out of nothing.

### D5 — Non-affiliation is an input, never a mid-flow gate

`checkAffiliation` runs at the **final** step only, and feeds `filterByEligibility` (90/10 margin) and `decideViability` (`no_afiliado_sin_cupo` is one possible `NonViableReason`). `getNextStep` has no affiliation branch: a non-affiliate answers the same 6 questions.

### D6 — Consent mints the lead id server-side

`POST /consent` accepts **no** `leadId`. If the client supplied one, a caller could overwrite an existing profiled lead with a fresh empty one (OWASP A01/A04). `/start` returns an ephemeral, unpersisted profile so the UI can render; `/consent` mints the real id via `IdGeneratorPort`, persists (first write ever), and returns it; `/turn` carries that id.

### D7 — Router owns the full `API_ROUTES` paths, `app.ts` mounts at root

`router.post(API_ROUTES.intake.turn, …)` + `app.use(intake.router)`. Rejected: mounting at `/api/leads/intake` with `'/turn'` literals — that splits a contract constant into a base path plus a re-typed suffix, which is exactly the "don't invent URLs" failure mode.

### D8 — 6 asked slots, 2 inferred

`SLOTS` has 8 entries but the UX rule caps at ~5–6 questions. Asked: `afiliacion`, `rangoSalarial`, `segmentoFamiliar`, `ciudad`, `ahorro`, `capacidadAhorroMensual`. Inferred by `updateProfile` from a single documented table: `personasACargo` ← `segmentoFamiliar`, `segmento` ← `toSmmlvBounds(rangoSalarial)` (`<2 → Basico`, `2–6 → Medio`, `>6 → Alto`; `Joven` is never inferred). Inferred slots are marked in `slotsLlenos` like any other. Mapping needs data-role confirmation (see Open Questions).

### D9 — Frontend fixtures never mask DATA_UNAVAILABLE

Fixtures cover only an **unreachable/timed-out** backend (`NETWORK_ERROR`, `TIMEOUT_ERROR`). On a real `DATA_UNAVAILABLE` (`carril: null`), the screen shows only the honest unclassified closing message — no score, no gauge, and no demo-fixture switch of any kind. Product decision (confirmed): the fixture fallback exists purely so the UI is demoable when the backend can't be reached at all; it must never appear as an option once the backend has actually answered with `carril: null`, silent or otherwise — that would blur the line between a real and a fabricated glass-box classification.

### D10 — Supabase is a **second** `LeadRepository` adapter, selected by `PERSISTENCE_DRIVER`

**Already executed at the infrastructure level, not hypothetical:** `supabase/config.toml` and
`supabase/migrations/20260725060448_create_lead_profiles.sql` exist, the migration **is already applied on the live
remote project** (`supabase db push` — done, not pending), and `@supabase/supabase-js@^2.110.8` is already in
`package.json`. What F1 still owes is the **adapter**, not the schema.

| Option | Tradeoff | Decision |
|---|---|---|
| Replace `InMemoryLeadRepository` with Supabase | Kills the no-credentials dev/test path; unit tests would hit a real database | Rejected |
| New port (`SupabasePort` / `PostgresPort`) | `LeadRepository` already is the port; a second one for the same capability is exactly the ceremony `config.yaml` `rules.design` forbids | Rejected |
| Second adapter behind the **existing** `LeadRepository`, chosen by env via a factory that mirrors `llm.factory.ts` | One more file plus one switch; two adapters to keep behaviourally equal | **Chosen** |

Scope: **`save` + `findById` only.** `saveEnriched`, `findEnrichedById` and `listViable` keep their current
in-memory/`TODO` bodies — they are F2.1/F3 concerns and the migration has no `enriched_leads` table on purpose.
`InMemoryLeadRepository` is **not deleted**: it stays the default driver for tests and for local dev without
credentials.

Layer: `infrastructure`. `domain` and `application` never see a Postgres row shape — this adapter is the **only**
translator between the flat+`jsonb` row and the nested `LeadProfile`.

| Column (`lead_profiles`) | Type | `LeadProfile` field |
|---|---|---|
| `id` | `uuid` | `id` |
| `consentimiento` | `jsonb` | `consentimiento: ConsentRecord \| null` |
| `es_afiliado`, `rango_salarial`, `segmento`, `personas_a_cargo`, `ciudad`, `segmento_familiar` | scalar | `esAfiliado`, `rangoSalarial`, `segmento`, `personasACargo`, `ciudad`, `segmentoFamiliar` |
| `ahorro_declarado`, `capacidad_ahorro_mensual` | `bigint` | `ahorroDeclarado`, `capacidadAhorroMensual` (`COP`) |
| `slots_llenos` | `text[]` | `slotsLlenos: Slot[]` |
| `capacidad`, `score`, `proyectos` | `jsonb` | `capacidad`, `score`, `proyectos` |
| `carril` | `text` (checked) | `carril: Carril \| null` |
| `created_at`, `updated_at` | `timestamptz` | `createdAt`, `updatedAt` (`IsoDateTime`) |

Three mapping rules that are **not** mechanical, and are where the bugs would live:

1. `timestamptz` returns `…+00:00`; the contract says ISO-8601 UTC with `Z` → normalize with `new Date(v).toISOString()`
   on read. Otherwise `createdAt` has a different string shape depending on the driver.
2. `bigint` COP columns arrive as JSON numbers; values are integer pesos far below `2^53`. **No scaling, ever**
   (EQUIPO §7 trap 1).
3. `jsonb` columns are re-validated with a narrow zod row schema on read. The database is ours, but the row is still an
   untyped boundary, and `strict` + no-`any` needs the guarantee rather than a cast.

`save` is an **upsert on the primary key** — `/consent` (first write) and every `/turn` write use the same call — and
returns the persisted row mapped back, mirroring how the in-memory adapter returns its stored clone. `findById` on a
miss returns `err(new NotFoundError('Lead no encontrado'))`, the *same* message as the in-memory adapter, so the HTTP
surface does not change with the driver.

**A Supabase/network failure is NOT `DataUnavailableError`.** That code is reserved for the uncalibrated catalog and is
what produces the honest `carril: null` (D3); laundering an outage into it would fabricate an "unclassified" lead out of
an ops incident. Infrastructure failure → the adapter **throws** → `asyncHandler`/`errorHandler` → generic 500, no leak
(A09). No new `ERROR_CODES` entry, so `kernel/errors.ts` stays untouched.

Client construction: `createSupabaseClient(env)` inside `persistence.factory.ts`, using
`createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })` — a server process has
no session to persist. **No module-level singleton** (hidden global state, untestable). The table has RLS enabled with
zero policies, so the **`service_role` key bypasses RLS**: it lives only in `env` and `infrastructure`, never in a DTO,
never in a log, never in the frontend bundle.

`env.ts` (the only file allowed to read `process.env`) adds `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, widens
`PERSISTENCE_DRIVER` to `'memory' | 'supabase'`, and **fails at startup** when the driver is `supabase` without both
values — the same fail-early rule already applied to `LLM_PROVIDER=anthropic`.

`updated_at`: **the adapter writes the domain's value; no Postgres trigger.** `updateProfile(profile, valor, now)`
already stamps `updatedAt` from `ClockPort`. A trigger would overwrite it, so the stored row would disagree with the
`ConversationTurn` just returned to the client — two clocks, and non-deterministic tests. The column's `default now()`
stays as a safety net for rows written outside the app only. Decided here; not left open.

### D11 — DeepSeek as a third `LlmPort` provider, over native `fetch`, no SDK

| Option | Tradeoff | Decision |
|---|---|---|
| Add the `openai` npm SDK (DeepSeek is OpenAI-compatible) | A dependency for one `POST` — rule 19 | Rejected |
| Extend `AnthropicLlmAdapter` with a configurable base URL | Two wire formats in one class; a provider bug becomes everyone's bug | Rejected |
| `DeepseekLlmAdapter` implementing the existing `LlmPort` over native `fetch` (Node 22) | One more file, we hand-roll the request | **Chosen** |

Exactly the two existing methods, same glass-box constraint as the other adapters: nothing here scores, ranks,
classifies or decides. `DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'` is a hardcoded constant — never from
env, never from user input. Every call carries `AbortSignal.timeout(8_000)`: a hung model must not hang a chat turn in
front of the jury; a timeout is an `err`, and the turn degrades to a re-ask.

`extractSlotValue` — `temperature: 0`, `response_format: { type: 'json_object' }`. The instruction (target slot +
allowed vocabulary from `contexto` + "return only the requested slot value") lives in the `system` message; the user's
free text goes in the `user` message as **delimited data**, never concatenated into the instruction, so an injected
"ignore your instructions" cannot rewrite the task. The assistant string is parsed with
`z.object({ valor: z.string().max(120).nullable(), confianza: z.number().min(0).max(1) })`; any deviation (non-JSON,
extra fields, out-of-range `confianza`, non-2xx status) returns `err(ValidationError)` — never an approximated value
(rule 22, identical discipline to the Anthropic adapter). The use case then feeds `valor` **back through `parseAnswer`**
(D1): the model passes two gates, not one.

`writeExplanation` — the prompt states that the facts in `hechos` are already computed and explicitly forbids adding any
figure, percentage, promise, or the word "aprobado"; ≤2 sentences, neutral Spanish, factual tone. Output validated as
`z.string().trim().min(1).max(400)`; on `err` the deterministic text ships (already best-effort per the open question
below).

No PII beyond the ≤500-char text the user just typed: no `leadId`, no name, no phone number, no score internals.

`llm.factory.ts` gains a `'deepseek'` case next to `'anthropic'`, with the same missing-key guard; `stub` remains the
deliberate fallthrough default. `env.ts` adds `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` (default `deepseek-chat`) and
widens `LLM_PROVIDER` to `'stub' | 'anthropic' | 'deepseek'`.

## Data Flow

```
POST /start   → StartConversationUseCase ─→ createEmptyLeadProfile(ids.newId(), clock.now())
                                            (NOT persisted) → greeting + paso 'consentimiento'

POST /consent → SubmitConsentUseCase ─→ otorgado? version === activePolicyVersion?
                                        finalidades ⊇ perfilamiento_vivienda?
                                        ├─ no  → err(ConsentRequiredError)   [nothing persisted]
                                        └─ yes → ids.newId() → ConsentRecord → leads.save → 1st question

POST /turn    → ProcessConversationTurnUseCase
   leads.findById ─→ hasConsent(profile, activePolicyVersion) ─→ getNextStep
        │                                                            │
        │                            parseAnswer(slot, raw) ──err──→ llm.extractSlotValue ──→ parseAnswer
        │                                    │                                                    │
        │                                    └────────────── updateProfile (+inference) ←─────────┘
        │                                                            │
        │                                          isReadyToRoute? ──no──→ leads.save → next step
        │                                                   │yes
        │                     catalog.getWeights + getProjectProfiles
        │                          ├─ DataUnavailableError ──→ carril=null, routing=null, leads.save
        │                          └─ ok → estimateCapacity → scoreLead → filterByEligibility
        │                                  → matchProjects/explainMatch (+llm.writeExplanation, best-effort)
        │                                  → decideViability ─null?→ carril=null branch
        │                                                    └─────→ carril + RoutingDecision → leads.save
        └──────────────────────────────────────────────────────────────→ ConversationTurn

Front:  LeadIntakeScreen → useIntakeConversation (reducer + 3 useMutation) → api/ → apiPost/unwrap
```

## File Changes — Munin_back

| File | Action | Layer | Description |
|---|---|---|---|
| `src/features/lead-intake/domain/conversation.ts` | Create | domain | `getNextStep`, `parseAnswer`, `updateProfile`, `isReadyToRoute`, `buildBotMessage`, `computeProgress` (added: `ConversationTurn.progreso` needs a pure source) |
| `src/features/lead-intake/domain/profiling.ts` | Create | domain | `checkAffiliation`, `estimateCapacity`, `scoreLead`, `getTopFactors` |
| `src/features/lead-intake/domain/matching.ts` | Create | domain | `filterByEligibility`, `matchProjects`, `explainMatch` |
| `src/features/lead-intake/domain/routing.ts` | Create | domain | `decideViability` |
| `src/features/lead-intake/application/start-conversation.use-case.ts` | Create | application | `/start` |
| `src/features/lead-intake/application/submit-consent.use-case.ts` | Create | application | `/consent` — consent gate + first persistence |
| `src/features/lead-intake/application/process-conversation-turn.use-case.ts` | Create | application | `/turn` — slot loop + finalize + all three carril outcomes |
| `src/features/lead-intake/interface/intake.dto.ts` | Create | interface | zod schemas (length caps: `texto` ≤ 500) |
| `src/features/lead-intake/interface/intake.controller.ts` | Create | interface | `createIntakeRouter(deps)` + `publicRateLimiter` + `asyncHandler` + `sendOk`/`sendError` |
| `src/features/lead-intake/lead-intake.module.ts` | Create | composition | `createLeadIntakeModule(env): { router }` |
| `src/features/lead-intake/infrastructure/` | **Not created** | — | Confirmed: every adapter F1 needs already exists in `shared/infrastructure`. An empty folder would be dead scaffolding |
| `src/shared/infrastructure/persistence/supabase/supabase-lead.repository.ts` | Create | infrastructure | **Shared — announce.** D10. `save` (upsert) + `findById` over `@supabase/supabase-js`; exports pure `toRow`/`toDomain` so the mapping is unit-testable without a database |
| `src/shared/infrastructure/persistence/persistence.factory.ts` | Create | infrastructure | **Shared — announce.** D10. `createLeadRepository(env): LeadRepository` — `memory` \| `supabase`; deliberately shaped like `llm.factory.ts`, and the only place the Supabase client is constructed |
| `src/shared/infrastructure/llm/deepseek-llm.adapter.ts` | Create | infrastructure | **Shared — announce.** D11. `LlmPort` over native `fetch`; no `openai` SDK |
| `src/shared/infrastructure/llm/llm.factory.ts` | Modify | infrastructure | **Shared — announce.** D11. Add the `'deepseek'` case + missing-key guard; `stub` stays the default |
| `src/shared/infrastructure/config/env.ts` | Modify | infrastructure | **Shared — announce.** D10/D11. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`; widen `PERSISTENCE_DRIVER` and `LLM_PROVIDER`; fail-fast when a driver/provider lacks its credentials |
| `.env.example` | Modify | config | D10/D11. Document the four new vars and the new `PERSISTENCE_DRIVER`/`LLM_PROVIDER` values. Secrets stay empty placeholders (rule 16) |
| `supabase/migrations/20260725060448_create_lead_profiles.sql` | **Exists — already applied** | db | Pushed to the live remote project. **Not a task**: no schema to design, no migration to author |
| `src/shared/domain/lead.ts` | Modify | domain | **Shared — announce.** Implement `hasConsent(profile, activePolicyVersion)`, `missingSlots`, `isSlotFilled` |
| `src/shared/domain/value-objects/salary-range.ts` | Modify | domain | **Shared — announce.** Implement `toSmmlvBounds` |
| `src/app.ts` | Create | composition | **Bootstrap — announce.** `createApp(env): Express` |
| `src/main.ts` | Create | composition | **Bootstrap — announce.** `loadEnv()` → `createApp` → `listen` → SIGTERM |
| `tests/features/lead-intake/*.test.ts`, `tests/shared/domain/*.test.ts` | Create | tests | RED-first per `strict_tdd` |

`app.ts` order is load-bearing (`security.ts` documents it): `applySecurity(app, env)` → `createHttpLogger()` → `GET API_ROUTES.health` → `createLeadIntakeModule(env).router` → `notFoundHandler` → `errorHandler`. No F2–F4 wiring.

## File Changes — Munin_front

| File | Action | Layer | Description |
|---|---|---|---|
| `src/features/lead-intake/api/intake.api.ts` | Create | api | `startIntake`, `submitConsent`, `submitTurn` — all `unwrap(apiPost<ConversationTurn>(API_ROUTES.intake.*, body))` |
| `src/features/lead-intake/api/index.ts` | Create | api | internal barrel |
| `src/features/lead-intake/model/use-intake-conversation.ts` | Create | model | `useReducer` + 3 `useMutation`; last turn cached under `queryKeys.intake.conversation(leadId)` |
| `src/features/lead-intake/model/lead-intake.fixtures.ts` | Create | model | scripted `ConversationTurn[]`, fictitious data, no PII |
| `src/features/lead-intake/model/index.ts` | Create | model | internal barrel |
| `src/features/lead-intake/ui/lead-intake-screen.tsx` | Create | ui | state machine host |
| `src/features/lead-intake/ui/chat-shell.tsx` | Create | ui | header + message list + `TypingIndicator` + `QuickReplies` + free-text `Field` |
| `src/features/lead-intake/ui/intake-outcome.tsx` | Create | ui | three terminal states + `FactorBars` when `score !== null` |
| `src/features/lead-intake/index.ts` | Create | public | `export { LeadIntakeScreen }` — only symbol |
| `src/main.tsx`, `src/app/App.tsx` | Create | app | **Announce.** `RouterProvider` (react-router 8) |
| `src/app/providers/{query-client,error-boundary,motion,index}.tsx` | Create | app | **Announce.** QueryClient (`retry: 1`, no refetch-on-focus), ErrorBoundary, `MotionConfig reducedMotion="user"` |
| `src/app/routes/{index.tsx,privacy-policy.page.tsx}` | Create | app | **Announce.** `/` → `LeadIntakeScreen`; `/politica-de-datos` → minimal placeholder. No `/closer/*` |

**`/politica-de-datos` scope:** a **minimal in-repo page** is in scope — finalidades, titular rights (conocer/actualizar/rectificar/suprimir/revocar), the "qué NO pedimos" block, an explicit line disclosing that free-text answers may be processed by an external AI provider outside Colombia (required once `LLM_PROVIDER=deepseek` is reachable by real users — decided above), and a visible "esto es una demo, no es un aviso legal vigente de Colsubsidio" banner. The *supresión* right is listed per Ley 1581, but the page must also say plainly that F1 does not yet implement a self-service deletion flow — an honest gap beats a right the UI implies but can't fulfill. Without this page the consent is not *informed* and `ConsentNotice` links to a 404. Full legal privacy-policy text is **out of scope** and belongs to the proposal's non-goals.

## Interfaces / Contracts

`contracts.ts` is **unchanged**. New types below are feature-internal.

```ts
// domain/conversation.ts — feature-internal, keeps `LeadProfile` writes type-safe
export type SlotValue =
  | { slot: 'afiliacion'; valor: boolean }
  | { slot: 'rangoSalarial' | 'ciudad' | 'segmentoFamiliar'; valor: string }
  | { slot: 'segmento'; valor: Segmento }
  | { slot: 'personasACargo'; valor: number }
  | { slot: 'ahorro' | 'capacidadAhorroMensual'; valor: COP };

export function getNextStep(profile: LeadProfile): ConversationStep | null;
export function parseAnswer(slot: Slot, texto: string): Result<SlotValue, ValidationError>;
export function updateProfile(profile: LeadProfile, valor: SlotValue, now: IsoDateTime): LeadProfile;
export function isReadyToRoute(profile: LeadProfile): boolean;
export function buildBotMessage(input: { id: string; texto: string; quickReplies: QuickReply[]; now: IsoDateTime }): BotMessage;
export function computeProgress(profile: LeadProfile): number; // 0-1

// domain/profiling.ts
export interface AffiliationCheck { readonly esAfiliado: boolean; readonly aplicaCupo9010: boolean }
export function checkAffiliation(profile: LeadProfile): AffiliationCheck;
export function estimateCapacity(profile: LeadProfile): Result<CapacityBand, ValidationError>;
export function scoreLead(profile: LeadProfile, weights: ScoringWeights, now: IsoDateTime): Result<ScoreResult, DataUnavailableError>;
export function getTopFactors(score: ScoreResult, limite?: number): Factor[];

// domain/matching.ts
export function filterByEligibility(proyectos: readonly ProjectProfile[], profile: LeadProfile, capacidad: CapacityBand): ProjectProfile[];
export function matchProjects(elegibles: readonly ProjectProfile[], profile: LeadProfile, limite?: number): ProjectMatch[];
export function explainMatch(proyecto: ProjectProfile, profile: LeadProfile): { razon: string; hechos: Record<string, string> };

// domain/routing.ts — `null` iff score/capacidad missing (D4)
export function decideViability(input: {
  score: ScoreResult | null; capacidad: CapacityBand | null;
  afiliacion: AffiliationCheck; umbralViable: number; now: IsoDateTime;
}): RoutingDecision | null;

// shared/domain/lead.ts (D2)
export function hasConsent(profile: LeadProfile, activePolicyVersion: string): boolean;

// shared/domain/value-objects/salary-range.ts
// '0-2 SMMLV' → { desde: 0, hasta: 2 } · '>10 SMMLV' → { desde: 10, hasta: null }
export function toSmmlvBounds(range: SalaryRange): Result<SmmlvBounds, ValidationError>;

// application/
export interface ProcessConversationTurnDeps {
  readonly leads: LeadRepository; readonly catalog: DataCatalogPort; readonly llm: LlmPort;
  readonly clock: ClockPort; readonly ids: IdGeneratorPort; readonly activePolicyVersion: string;
}
export class ProcessConversationTurnUseCase {
  execute(input: { leadId: string; texto: string | null; quickReplyValue: string | null }): Promise<Result<ConversationTurn>>;
}
export class SubmitConsentUseCase {
  execute(input: { otorgado: boolean; versionPolitica: string; finalidades: FinalidadTratamiento[]; canal: string }): Promise<Result<ConversationTurn>>;
}
export class StartConversationUseCase { execute(): Promise<Result<ConversationTurn>> }
```

**Composition root wiring (amended by D10/D11).** `lead-intake.module.ts` wires `createLlmPort(env)`,
`createLeadRepository(env)`, `new FileDataCatalogAdapter({ weightsPath, projectProfilesPath })`, `new SystemClock()`,
`new CryptoIdGenerator()`, `env.privacyPolicyVersion`. Both adapter choices are **env-driven, never hardcoded**:

| Env var | Values | Default | Adapter |
|---|---|---|---|
| `LLM_PROVIDER` | `stub` \| `anthropic` \| `deepseek` | `stub` | `StubLlmAdapter` \| `AnthropicLlmAdapter` \| `DeepseekLlmAdapter` |
| `PERSISTENCE_DRIVER` | `memory` \| `supabase` | `memory` | `InMemoryLeadRepository` \| `SupabaseLeadRepository` |

`stub` + `memory` staying the defaults is load-bearing, not a leftover: it is what keeps the `app-bootstrap-back`
scenario true (clean checkout, `.env` from `.env.example`, no API key, `GET /api/health` answers) and what every
strict-TDD unit test uses — **no unit test touches the network or a database**. `app.ts`/`main.ts` are unchanged in
shape; they still just call `loadEnv()` → `createApp(env)` → `createLeadIntakeModule(env)`. **No new port is
introduced** (config.yaml `rules.design`): both factories only select among adapters of ports that already exist.

Frontend screen states, all driven by `ConversationTurn` — no local business logic:

| State | Predicate | Renders |
|---|---|---|
| `cargando` | start mutation pending | `Skeleton` + `TypingIndicator` |
| `consent-pendiente` | `profile.consentimiento === null` | `ConsentNotice` only — everything else gated |
| `consent-rechazado` | user declined | respectful terminal card, `/politica-de-datos` link, in-session retry; **nothing sent to the API** |
| `conversando` | `siguientePaso !== null` | `ChatBubble` list + `QuickReplies` + `Field` + `ProgressBar value={progreso}` |
| `completado-viable` | `siguientePaso === null && routing?.carril === 'viable'` | `explicacion` + `ProjectMatch.razon` + `FactorBars factores={score.factores} weightsVersion` |
| `completado-no-viable` | `… routing?.carril === 'no_viable'` | `explicacion` + `razones`, "todavía no" tone, `FactorBars` |
| `completado-sin-clasificar` | `siguientePaso === null && routing === null` | honest closing message, **no score, no gauge, no fixture switch** (D9) |
| `error` | `ApiRequestError` | `Alert` with backend `message`; fixture offer only on network/timeout |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (back) | `parseAnswer`, `updateProfile` inference, `isReadyToRoute`, `computeProgress`, `toSmmlvBounds` (incl. `>10`), `estimateCapacity`, `scoreLead` (+ missing-weights → `DataUnavailableError`), `getTopFactors`, `filterByEligibility`, `matchProjects`, `decideViability` (incl. `null`), `hasConsent` version mismatch | vitest, pure fns, RED-first |
| Unit (back, application) | 3 carril outcomes; no-consent → no `save`; LLM low-confidence → re-ask; `StubLlmAdapter` completes the flow | fake ports (in-memory repo, stub LLM, fixed clock/ids, fake catalog returning `err(DataUnavailableError)`) |
| Unit (back, infrastructure) | D10 `toRow`/`toDomain` round-trip: `timestamptz +00:00 → …Z`, `null` `jsonb` columns, empty `slots_llenos`, COP values unscaled, `carril: null`. D11 response parsing: valid JSON, non-JSON, out-of-range `confianza`, non-2xx, timeout → all `err` | vitest on the **pure exported** mappers/parsers; the network and database calls are never exercised in unit tests |
| Unit (front) | reducer transitions, the 8 screen states, "estimado" copy, `FactorBars` never rendered without `factores` | vitest + happy-dom + Testing Library |
| Integration | Not configured in either repo (`config.yaml`) | Manual smoke: `GET /api/health`, full flow at `/`, plus one run with `PERSISTENCE_DRIVER=supabase` + `LLM_PROVIDER=deepseek` before the demo — the wire paths have no automated coverage by design |
| E2E | None | Human self-guided test (EQUIPO §10) |

## Threat Matrix

Applicable boundary: **HTTP routing + untrusted LLM text**. No shell, subprocess, VCS/PR automation or executable-file classification — those rows are `N/A`.

| Row | Applicable | Expected behavior | RED test |
|---|---|---|---|
| Unvalidated input reaching a use case | Yes | zod at `interface/` only; ≤500-char `texto` bounds prompt-injection surface | malformed `/turn` body → `VALIDATION_ERROR`, use case never invoked |
| Prompt injection via free text | Yes | text passed as delimited data; LLM output re-parsed by `parseAnswer`; low confidence → re-ask | injected instruction string → slot unchanged, re-ask returned |
| Client-controlled identifier (id overwrite) | Yes | `/consent` ignores any client id; server mints it (D6) | consent body carrying `leadId` → field stripped, new id minted |
| Processing/persisting without consent | Yes | `ConsentRequiredError` (403) before any `save` | no-consent `/turn` → `save` never called |
| PII in logs | Yes | pino `redact` untouched; controllers log no payloads | log assertion on a `/turn` with free text |
| Information leakage in errors | Yes | `errorHandler` + `sendError`, `{code,message,fields}` only | forced adapter failure → no stack/path in body |
| Public-endpoint abuse | Yes | `publicRateLimiter` on all `/api/leads/intake/*` | 61st request in window → 429 `ApiResponse` |
| Service-role credential / RLS bypass (D10) | Yes | `SUPABASE_SERVICE_ROLE_KEY` read only by `env.ts`, used only by `persistence.factory.ts`; RLS on with zero policies, so no anon access exists; the key never enters a DTO, a log or the frontend | `loadEnv` with `PERSISTENCE_DRIVER=supabase` and a missing key → startup throws; log assertion: no `SUPABASE_*` value in any emitted line |
| Persistence outage masquerading as `DATA_UNAVAILABLE` (D10) | Yes | adapter throws on infra failure → generic 500; `carril: null` stays reserved for the uncalibrated catalog | repository failure at the routing step → error surfaces, and **no** unclassified profile is persisted or returned |
| Outbound third-party LLM call (D11) | Yes | fixed hardcoded endpoint constant (never env/user-derived), bearer key never logged, `AbortSignal.timeout`, non-2xx → `err`, no PII beyond the current ≤500-char text | non-2xx / malformed JSON / timeout → `err(ValidationError)`, slot unchanged, turn re-asks |
| Shell / subprocess / VCS / executable classification | **N/A** | no such boundary in F1 | — |

## Migration / Rollout

**The database migration is already applied — it is not a future task.** `20260725060448_create_lead_profiles.sql` has
been pushed to the live remote Supabase project, so this change authors **no schema and no migration**: only the adapter,
the factory and the env fields. `contracts.ts` remains untouched, and `LeadProfile` did not change to accommodate the
table (the table was shaped to fit the contract).

Rollout is a runtime switch, not a cutover: `PERSISTENCE_DRIVER=memory` and `LLM_PROVIDER=stub` remain the defaults, so
the demo and the tests keep working with zero credentials; the deployed environment opts in per variable. Rollback of
D10/D11 is therefore **environment-level first** (flip the variable back — no code change, no data to reverse; the table
simply stops receiving rows) and code-level second (delete the two adapters + the factory; `LeadRepository` and `LlmPort`
are unchanged, so nothing else moves). Rollback for the rest of F1 per `proposal.md`: drop the branch, restore the four
shared-domain stub bodies.

Delivery follows the proposal's chained-PR recommendation: (1) back domain + shared stubs + tests, (2) back application/interface/module + bootstrap, (3) front slice + fixtures, (4) front bootstrap + routing.

## Open Questions

- [ ] D8 inference table (`segmentoFamiliar → personasACargo`, `rangoSalarial → segmento`) needs data-role confirmation against the 4.142-buyer Excel; `Joven` is deliberately not inferable.
- [ ] `estimateCapacity` constants (`cuota ≤ 30% ingreso`, credit horizon in months, banda thresholds) are placeholders until `analysis/` calibrates them — they must live as named, documented constants so a reviewer can point at the line.
- [ ] `explainMatch`/carril explanation via `llm.writeExplanation` is best-effort: on `err` the deterministic text ships. Confirm the team accepts stub-LLM prose in the demo.
- [x] D9 (fixtures never replace `DATA_UNAVAILABLE`, no demo-switch escape hatch either) — confirmed by product owner. Fixtures apply only to `NETWORK_ERROR`/`TIMEOUT_ERROR`.
- [x] D10 `updated_at` — **decided here, not open**: the adapter persists the domain's `ClockPort` value; no Postgres trigger, because a trigger would overwrite it and the stored row would disagree with the `ConversationTurn` already returned to the client.
- [x] **`PERSISTENCE_DRIVER` for the public demo — decided by product owner.** F1 ships with `supabase` and **no delete endpoint**. This is an explicit, documented non-goal (see proposal.md non-goals) rather than a built feature — the *derecho de supresión* gap goes on the "qué necesitamos de Colsubsidio" slide, not into this change's scope. Do not silently add a delete endpoint later without re-opening this as its own SDD change.
- [x] **`LLM_PROVIDER=deepseek` — decided by product owner: update the consent copy, don't restrict the provider.** `/politica-de-datos` and the `ConsentNotice` finalidades copy must disclose that free-text answers may be processed by an external AI provider outside Colombia before `deepseek` is used in any environment the titular can reach. This is a **content task**, not a `contracts.ts`/`FinalidadTratamiento` enum change — the enum already covers *purpose* (`perfilamiento_vivienda`), the disclosure is about *mechanism* and lives in the privacy-policy prose. Tracked as a task against the `/politica-de-datos` placeholder page (see below) and the frontend `ConsentNotice` copy.
