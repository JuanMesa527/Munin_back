# Tasks: F1 · lead-intake (cross-repo: Munin_back + Munin_front)

> **Canonical copy.** Mirror pointer: `Munin_front/openspec/changes/lead-intake/tasks.md`.
> Reads: `proposal.md`, `specs/lead-intake-{conversation,profiling,matching,routing,interface}`,
> `specs/app-bootstrap-back`, `design.md` (D1–D9; **D9 tightened**: fixtures = `NETWORK_ERROR`/
> `TIMEOUT_ERROR` only, never a manual switch away from a real `carril: null`).
> **Amendment:** adds Phase 5 / Unit 5 for D10 (Supabase persistence adapter) and D11 (DeepSeek
> LLM adapter), added to `design.md` after this file's original phases 1–4 were written. Also
> updates task 2.11 (module wiring) and frontend Phase 4 tasks 4.4/4.6 to match the amended
> `/politica-de-datos` scope and the now-resolved Open Questions ([x] in `design.md`).
> Size note: like `design.md`, this artifact is over the 530-word task budget on purpose — five
> work units across two repos and one amendment pass.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~4,400–4,700 total (was ~3,600–3,900; +~800 for Unit 5 — see per-unit breakdown) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | 5 work units below (per design's delivery plan; Unit 5 added by the D10/D11 amendment) |
| Delivery strategy | ask-on-risk |
| Chain strategy | **stacked-to-main — confirmed** |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Per-unit estimate (production + strict-TDD tests, `additions+deletions`):**
- Unit 1 (back domain + shared stubs): ~590 prod (`conversation.ts` ~180, `profiling.ts` ~150,
  `matching.ts` ~100, `routing.ts` ~40, `lead.ts`+`salary-range.ts` stub bodies ~40) + ~650
  tests (6 test files, multi-scenario) ≈ **~1,240 lines**.
- Unit 2 (back application+interface+module+bootstrap): ~600 prod (3 use cases ~300, dto ~80,
  controller ~120, module ~50, `app.ts`+`main.ts` ~100) + ~400 tests ≈ **~1,000 lines**.
- Unit 3 (front ui/model/api+fixtures): ~700 prod (api ~45, model incl. fixtures ~350, ui ~330,
  index ~5) + ~350 tests ≈ **~1,050 lines**.
- Unit 4 (front bootstrap+routing): ~350 prod (providers ~150, routes incl. privacy page ~170,
  App/main ~50) + ~120 tests ≈ **~470 lines**.
- Unit 5 (back infra adapters: supabase + deepseek, D10/D11): ~480 prod (`env.ts` diff ~25,
  `supabase-lead.repository.ts` incl. `toRow`/`toDomain` ~190, `persistence.factory.ts` ~55,
  `deepseek-llm.adapter.ts` ~170, `llm.factory.ts` diff ~20, `.env.example` diff ~15) + ~320
  tests (mapping round-trip tests ~150, DeepSeek response-parsing/validation tests ~170) ≈
  **~800 lines**. Rough/honest estimate — no migration to author (already applied), so this is
  adapter + mapping + fetch-client code only.

**Risk**: every unit individually exceeds the 400-line budget except possibly unit 4
(borderline). The mandated 5-group split is a *review-sequencing* boundary, not a
budget-compliant PR size on its own — the user may need to further sub-chain within a unit
(e.g. split unit 1 into "shared stubs" vs "domain functions", unit 3 into "api+model" vs "ui",
or unit 5 into "supabase adapter" vs "deepseek adapter") once real diffs are measured. Flag
this explicitly before `sdd-apply`.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Back: domain + shared-domain stubs implemented, pure & tested | PR 1 | `npm test -- tests/shared/domain tests/features/lead-intake/domain` | N/A — pure functions, no HTTP surface yet | Revert restores the four `throw new Error('TODO: not implemented')` bodies; no other file touched |
| 2 | Back: application+interface+module+bootstrap — first runnable server | PR 2 | `npm test -- tests/features/lead-intake/application tests/features/lead-intake/interface` | `npm run dev` → `curl :3000/api/health` + scripted `/start→/consent→/turn` with `StubLlmAdapter` | Drop `app.ts`, `main.ts`, `application/`, `interface/`, `lead-intake.module.ts`; unit 1 stays intact, unused |
| 3 | Front: feature slice renders against backend contracts | PR 3 | `npm run test -- src/features/lead-intake` (Munin_front) | `npm run dev` (front) against back `:3000` — manual consent→turn→outcome smoke | Drop `src/features/lead-intake/**`; nothing mounts it yet, so no other file touched |
| 4 | Front: bootstrap mounts `/` → `LeadIntakeScreen`, demoable end to end | PR 4 | `npm run test -- src/app` | `npm run dev` → open `/` → full self-guided flow (proposal success criterion) | Drop `main.tsx`, `src/app/**`; unit 3's slice stays but unmounted |
| 5 | Back: Supabase persistence adapter + DeepSeek LLM adapter, selected via env-driven factories | PR 5 — stacks on top of PR 2 in the backend chain (not after PR 4; front units 3/4 are a separate repo chain) | `npm test -- tests/shared/infrastructure/persistence/supabase tests/shared/infrastructure/llm` | Manual pre-demo smoke only: `PERSISTENCE_DRIVER=supabase LLM_PROVIDER=deepseek npm run dev` + one full `/start→/consent→/turn` run against the live Supabase project — network/DB calls have no automated coverage (`config.yaml` `integration:false`) | Flip `PERSISTENCE_DRIVER=memory`/`LLM_PROVIDER=stub` back — env-only, no code change, no data to reverse; or drop the two adapter files + `persistence.factory.ts` and revert `llm.factory.ts`'s `'deepseek'` case — `LeadRepository`/`LlmPort` ports unchanged, nothing else moves |

## Phase 1: Backend Domain + Shared-Domain Stubs (Unit 1 · Munin_back)

- [x] 1.1 RED `tests/shared/domain/lead.test.ts` — `hasConsent`: no consent, version mismatch, valid consent; `missingSlots` order; `isSlotFilled` double-check. Spec: lead-intake-conversation "Consent Gate Enforced in Domain".
- [x] 1.2 GREEN implement `hasConsent`/`missingSlots`/`isSlotFilled` in `src/shared/domain/lead.ts`.
- [x] 1.3 RED `tests/shared/domain/value-objects/salary-range.test.ts` — `toSmmlvBounds` incl. open `>10 SMMLV`. Feeds design D8's `segmento` inference.
- [x] 1.4 GREEN implement `toSmmlvBounds` in `src/shared/domain/value-objects/salary-range.ts`.
- [x] 1.5 RED `tests/features/lead-intake/domain/conversation.test.ts` — `getNextStep` skips inferred slots; `parseAnswer` pure; `updateProfile` inference table (D8); `isReadyToRoute`; `buildBotMessage`; `computeProgress`. Spec: lead-intake-conversation "Bounded, Inference-First Question Flow", "Non-Affiliation Never Short-Circuits".
- [x] 1.6 GREEN implement `src/features/lead-intake/domain/conversation.ts`.
- [x] 1.7 RED `tests/features/lead-intake/domain/profiling.test.ts` — `checkAffiliation` is a factor not a gate; `estimateCapacity` raw COP (no ×/÷1000); `scoreLead` non-empty `factores`, no `estrato` key, no `LlmPort` param; `DataUnavailableError` branch; `getTopFactors`. Spec: lead-intake-profiling (all 4 requirements).
- [x] 1.8 GREEN implement `src/features/lead-intake/domain/profiling.ts`.
- [x] 1.9 RED `tests/features/lead-intake/domain/matching.test.ts` — `filterByEligibility`; `matchProjects` non-empty `razon`, no `LlmPort` param; `explainMatch`; `DataUnavailableError` propagation, never fabricated. Spec: lead-intake-matching.
- [x] 1.10 GREEN implement `src/features/lead-intake/domain/matching.ts`.
- [x] 1.11 RED `tests/features/lead-intake/domain/routing.test.ts` — `decideViability` returns `null` iff `score`/`capacidad` null, no `LlmPort` param. Spec: lead-intake-routing "Pure, LLM-Free Routing Decision".
- [x] 1.12 GREEN implement `src/features/lead-intake/domain/routing.ts`.

## Phase 2: Backend Application + Interface + Composition Root (Unit 2 · Munin_back)

Depends on Phase 1 (all domain fns + shared stubs green). Task 2.11's factory-based repository
wiring references `persistence.factory.ts` (Phase 5, task 5.4) — if Phase 5 hasn't landed yet
when Phase 2 ships, wire `new InMemoryLeadRepository()` directly (as originally scoped) and let
Phase 5's own diff swap that one line to `createLeadRepository(env)`; no duplicate task needed
either way. `createLlmPort(env)` already exists pre-amendment, so the LLM half of 2.11 is
unaffected.

- [x] 2.1 RED `tests/features/lead-intake/application/start-conversation.test.ts` — returns ephemeral, unpersisted profile.
- [x] 2.2 GREEN implement `application/start-conversation.use-case.ts`.
- [x] 2.3 RED `tests/features/lead-intake/application/submit-consent.test.ts` — server mints id, strips any client-supplied `leadId` (D6, threat matrix "client-controlled identifier"), `ConsentRequiredError` on decline/version mismatch, first `leads.save`.
- [x] 2.4 GREEN implement `application/submit-consent.use-case.ts`.
- [x] 2.5 RED `tests/features/lead-intake/application/process-conversation-turn.test.ts` — 3 carril outcomes (`viable`/`no_viable`/`null`); no-consent → `save` never called; injected-instruction free text → slot unchanged, re-ask (prompt-injection threat row); LLM low-confidence → re-ask; `StubLlmAdapter` completes the flow; `DataUnavailableError` → `carril:null`, `routing:null`, still `leads.save`. Spec: lead-intake-conversation DATA_UNAVAILABLE + Non-Classified Persisted; lead-intake-routing "Three Persisted Outcomes".
- [x] 2.6 GREEN implement `application/process-conversation-turn.use-case.ts`.
- [x] 2.7 RED `tests/features/lead-intake/interface/intake.dto.test.ts` — malformed body rejected, `texto` ≤500 chars. Spec: lead-intake-interface "Zod Validation at Every Endpoint".
- [x] 2.8 GREEN implement `interface/intake.dto.ts`.
- [x] 2.9 RED `tests/features/lead-intake/interface/intake.controller.test.ts` (+ dedicated `intake.controller.rate-limit.test.ts`, see Deviations note) — malformed `/turn` never reaches use case; no raw PII/payload in logs; 61st request in window → 429; forced adapter failure → no stack/path in body. Spec: lead-intake-interface "No PII in Logs"; threat matrix "public-endpoint abuse", "information leakage in errors".
- [x] 2.10 GREEN implement `interface/intake.controller.ts` (`createIntakeRouter`, `publicRateLimiter`, `asyncHandler`, `sendOk`/`sendError`).
- [x] 2.11 GREEN implement `lead-intake.module.ts` (`createLeadIntakeModule(env): { router }` — no new port). Deviation from this line's literal text (see apply-progress Deviations): wires `StubLlmAdapter`/`InMemoryLeadRepository` DIRECTLY instead of `createLlmPort(env)`/`createLeadRepository(env)`, per this work unit's explicit scope (Phase 5 lands `persistence.factory.ts` and swaps these two lines; `createLlmPort(env)` already exists but is intentionally not wired yet either, to keep both adapter choices consistent and swap together in Phase 5). Spec: lead-intake-interface "Feature Isolation via Module Boundary".
- [x] 2.12 RED bootstrap test (`tests/app.test.ts`) — `GET /api/health` responds without LLM key; only `lead-intake.module.ts` mounted, no F2–F4 wiring. Spec: app-bootstrap-back (both scenarios).
- [x] 2.13 GREEN implement `src/app.ts` (`security→logger→health→intake router→notFoundHandler→errorHandler` order).
- [x] 2.14 GREEN implement `src/main.ts` (`loadEnv → createApp → listen → SIGTERM`).

## Phase 3: Frontend Feature Slice + Fixtures (Unit 3 · Munin_front)

Scaffold in parallel with Phase 2 using fixtures as stand-ins; mark "ready" once Phase 2's DTOs land.

- [ ] 3.1 RED `src/features/lead-intake/api/intake.api.test.ts` — `startIntake`/`submitConsent`/`submitTurn` call `unwrap(apiPost(API_ROUTES.intake.*, body))`.
- [ ] 3.2 GREEN implement `api/intake.api.ts` + `api/index.ts`.
- [ ] 3.3 RED `model/use-intake-conversation.test.ts` — reducer transitions across the 8 screen states; last turn cached under `queryKeys.intake.conversation(leadId)`; no `localStorage`/`sessionStorage`. Spec: lead-intake-screen "No Business Logic in the UI Layer".
- [ ] 3.4 GREEN implement `model/use-intake-conversation.ts` + `model/index.ts`.
- [ ] 3.5 Create `model/lead-intake.fixtures.ts` — scripted `ConversationTurn[]`, fictitious/no-PII data. **Applies only as a `NETWORK_ERROR`/`TIMEOUT_ERROR` fallback — never as a switch away from a real `routing:null`/`carril:null` response (D9, tightened).**
- [ ] 3.6 RED `ui/intake-outcome.test.tsx` — `completado-sin-clasificar` renders the honest closing message only, no `FactorBars`/score, no fixture switch even when `routing:null` arrives from a live backend. Spec: lead-intake-screen "Honest DATA_UNAVAILABLE Presentation, Fixtures Isolated From It" (both scenarios).
- [ ] 3.7 GREEN implement `ui/intake-outcome.tsx`.
- [ ] 3.8 RED `ui/chat-shell.test.tsx` — quick replies + free text both interactive; `ProgressBar` bound to `progreso`. Spec: lead-intake-screen "Bounded Question UX with Quick Replies".
- [ ] 3.9 GREEN implement `ui/chat-shell.tsx`.
- [ ] 3.10 RED `ui/lead-intake-screen.test.tsx` — all 8 states incl. `Skeleton`/`EmptyState`/`Alert`; decline → retry in same session, nothing sent to API; "estimado" copy, never "aprobado"; no `estrato` factor shown. Spec: lead-intake-screen "Consent-First, Retryable Consent Flow", "Loading, Empty, and Error States Are Mandatory", "Copy Discipline".
- [ ] 3.11 GREEN implement `ui/lead-intake-screen.tsx`.
- [ ] 3.12 GREEN implement `src/features/lead-intake/index.ts` — export only `LeadIntakeScreen`.

## Phase 4: Frontend Bootstrap + Routing (Unit 4 · Munin_front)

Depends on Phase 3 (feature slice exported).

- [ ] 4.1 RED `app/providers/error-boundary.test.tsx` — render error caught, friendly message, no blank page/stack. Spec: app-bootstrap-front "Required Providers Wired".
- [ ] 4.2 GREEN implement `app/providers/{query-client,error-boundary,motion,index}.tsx` (`retry:1`, no refetch-on-focus; `MotionConfig reducedMotion="user"`).
- [ ] 4.3 RED route-table test — router mounts only `/` → `LeadIntakeScreen`; no `/closer/*` route exists. Spec: app-bootstrap-front "Minimal Router Surface" (both scenarios).
- [ ] 4.4 GREEN implement `app/routes/index.tsx` + `app/routes/privacy-policy.page.tsx` — finalidades, titular rights (conocer/actualizar/rectificar/suprimir/revocar), "qué NO pedimos", demo banner, **plus two lines required by the D10/D11 amendment**: (a) free-text answers may be processed by an external AI provider outside Colombia, (b) F1 does not yet implement self-service deletion — an honest gap, not a promised right the UI can't fulfill.
- [ ] 4.5 GREEN implement `src/app/App.tsx` (`RouterProvider`) + `src/main.tsx`.
- [ ] 4.6 Modify `src/shared/ui/consent-notice.tsx` — add a one-line AI-provider international-transfer disclosure matching `/politica-de-datos`'s new line (D11 Open Questions resolution: "update the consent copy, don't restrict the provider"); finalidades copy is hardcoded in `TEXTO_FINALIDAD`, not passed via props. **Shared UI file — announce (rule 25).**
- [ ] 4.7 Manual smoke: clean checkout → `npm run dev` (both repos) → `/` renders `LeadIntakeScreen`, full flow completes unaided. Verifies proposal success criteria.

## Phase 5: Backend Infra Adapters — Supabase + DeepSeek (Unit 5 · Munin_back)

Added by the D10/D11 design amendment. No dependency on Phase 1 domain code — can be authored
in parallel with Phase 1. In the backend PR stack it merges **on top of PR 2** (task 2.11 wants
`persistence.factory.ts`), ahead of the frontend's own PR 3/4 chain in the other repo. Per
`design.md`'s Testing Strategy, `config.yaml` has `integration: false`: only the pure
`toRow`/`toDomain` mapping functions and the DeepSeek response-parsing/validation logic are
unit-tested here — the actual network/Supabase calls are a manual pre-demo smoke check, never
part of CI. The migration `supabase/migrations/20260725060448_create_lead_profiles.sql` already
exists and is already applied to the live remote project — no migration task below.

- [ ] 5.1 Modify `src/shared/infrastructure/config/env.ts` — add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (default `deepseek-chat`); widen `PERSISTENCE_DRIVER` to `'memory' | 'supabase'` and `LLM_PROVIDER` to include `'deepseek'`; fail-fast at startup when the selected driver/provider lacks its credentials. **Shared file — announce (rule 4/26).**
- [ ] 5.2 RED `tests/shared/infrastructure/persistence/supabase/supabase-lead.repository.test.ts` — `toRow`/`toDomain` round-trip: `timestamptz +00:00 → …Z` ISO normalization, `null` jsonb columns, empty `slots_llenos`, bigint COP values unscaled (never ×/÷1000), `carril: null`.
- [ ] 5.3 GREEN implement `src/shared/infrastructure/persistence/supabase/supabase-lead.repository.ts` — `save` (upsert on PK, same shape as the in-memory adapter's stored clone) + `findById` (miss → `err(NotFoundError('Lead no encontrado'))`, identical message to the in-memory adapter) over `@supabase/supabase-js`; exports pure `toRow`/`toDomain`; `jsonb` columns re-validated with a narrow zod row schema on read. Scope: `save`+`findById` only — `saveEnriched`/`findEnrichedById`/`listViable` keep their current stub bodies (F2.1/F3 concern; no `enriched_leads` table exists).
- [ ] 5.4 Create `src/shared/infrastructure/persistence/persistence.factory.ts` — `createLeadRepository(env): LeadRepository`, switches on `env.persistenceDriver` (`memory` default / `supabase`); constructs the Supabase client with `createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })`, no module-level singleton. Mirrors `llm.factory.ts`'s existing pattern; introduces no new port.
- [ ] 5.5 RED `tests/shared/infrastructure/llm/deepseek-llm.adapter.test.ts` — response parsing/validation only, no network: valid JSON, non-JSON, out-of-range `confianza`, non-2xx status, timeout → all `err(ValidationError)`.
- [ ] 5.6 GREEN implement `src/shared/infrastructure/llm/deepseek-llm.adapter.ts` — `LlmPort.extractSlotValue`/`writeExplanation` over native `fetch` against the hardcoded `DEEPSEEK_URL` constant (never env/user-derived); `temperature: 0`, `response_format: { type: 'json_object' }`, `AbortSignal.timeout(8_000)`; zod-validates the parsed output; `writeExplanation`'s prompt forbids invented figures/percentages/"aprobado"; no `openai` SDK dependency (rule 19).
- [ ] 5.7 Modify `src/shared/infrastructure/llm/llm.factory.ts` — add the `'deepseek'` case (missing-key guard, same shape as `'anthropic'`) alongside `'stub'`/`'anthropic'`; `stub` stays the default. **Shared file — announce.**
- [ ] 5.8 Modify `.env.example` — document the four new vars and the widened `PERSISTENCE_DRIVER`/`LLM_PROVIDER` values; secrets stay empty placeholders (rule 16).
- [ ] 5.9 Manual pre-demo smoke (not automated, no CI coverage by design): `PERSISTENCE_DRIVER=supabase LLM_PROVIDER=deepseek npm run dev` → run `/start→/consent→/turn` end to end against the live Supabase table and real DeepSeek endpoint; confirm no `SUPABASE_*`/`DEEPSEEK_*` value appears in any emitted log line (threat matrix rows for D10/D11).

## Notes / Follow-ups

- Frontend mirror `design.md` still describes a manual "Ver ejemplo con datos de demostración"
  fixture switch usable even after a real `carril: null` response — that contradicts the
  tightened D9 this task list follows (fixtures = network/timeout fallback only). Tasks 3.5/3.6
  implement the **tightened** rule; the frontend `design.md` mirror needs a follow-up edit to
  match before archive.
- Frontend `shared/ui/consent-notice.tsx` copy still says the titular can "conocer, actualizar,
  rectificar **y suprimir**" their data without qualification. That reads as a promised
  self-service deletion right, which conflicts with the D10 Open Questions resolution (F1 ships
  no delete endpoint, documented as a non-goal). Not converted into a task here — out of the
  literal AI-provider-disclosure scope given for this amendment — but flag it for a follow-up
  copy pass alongside task 4.6 in the frontend mirror before archive.
