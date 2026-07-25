# Proposal: F1 · lead-intake (cross-repo: Munin_back + Munin_front)

> **Canonical copy.** Mirror pointer: `Munin_front/openspec/changes/lead-intake/proposal.md`.
> Cross-repo change: both task lists must land together for F1 to be demoable.

## Intent

Raw paid-media leads reach the advisor unprofiled: no verified capacity, many non-affiliates, no purchasing power. F1 is the self-service WhatsApp-style chat (no login) that makes the lead profile itself: consent gate → affiliation → capacity → deterministic score → project matching → `carril: 'viable' | 'no_viable'`, persisted.

Why now: F1 owns **45% of the rubric** — 30% perfilamiento (calibrated score + glass-box `ScoreResult.factores`) and 15% UX (self-guided, ≤5–6 questions, no interrogation feel). It is also the first screen a judge touches, and every downstream feature (F2.1/F2.2/F3/F4) reads the `LeadProfile` it produces.

Current gap: contracts, ports, adapters and UI primitives exist, but **no feature and no composition root exist on disk** (`src/app.ts`, `src/main.ts`, `src/app/`, `src/main.tsx` are absent despite README prose). Nothing runs end to end today.

## Scope

### In Scope — Munin_back

- `src/features/lead-intake/{domain,application,infrastructure,interface}/` + `lead-intake.module.ts` (`{ router }`).
- Deterministic domain: *conversation* (`getNextStep`, `parseAnswer` via `LlmPort`, `updateProfile`, `isReadyToRoute`, `buildBotMessage`), *profiling* (`checkAffiliation`, `estimateCapacity`, `scoreLead`, `getTopFactors`), *matching* (`matchProjects`, `filterByEligibility`, `explainMatch`), *routing* (`decideViability`).
- One orchestrating use case per `API_ROUTES.intake` endpoint (`start`, `turn`, `consent`); zod DTOs at the interface edge via `validate.ts`.
- **Shared-file changes (announce to team, rule 4/26):** implement `shared/domain/lead.ts` → `hasConsent`, `missingSlots`, `isSlotFilled`; `shared/domain/value-objects/salary-range.ts` → `toSmmlvBounds`.
- **Bootstrap (shared/bootstrap territory — announce):** minimal `src/app.ts` + `src/main.ts` — `security.ts`, `errorHandler`, `GET /api/health`, mounting **only** `lead-intake.module.ts`; default adapters `StubLlmAdapter`, `InMemoryLeadRepository`, `FileDataCatalogAdapter`, `SystemClockAdapter`, `CryptoIdGeneratorAdapter`. Generic enough for F2–F4 to extend, but no wiring for them.

### In Scope — Munin_front

- `src/features/lead-intake/{ui,model,api}/` + `index.ts` exposing `LeadIntakeScreen`, built from existing `shared/ui` (`ConsentNotice`, `ChatBubble`, `QuickReplies`, `ProgressBar`, `TypingIndicator`, `FactorBars`, `Field`) and `shared/api` (`apiGet`/`apiPost`/`unwrap`, `queryKeys.intake`). Loading/empty/error states mandatory.
- `model/lead-intake.fixtures.ts` — demo dataset so the screen is reviewable while backend data is uncalibrated. Frontend-only; never masks the real `DATA_UNAVAILABLE` path.
- **Bootstrap (announce):** `src/main.tsx`, `src/app/App.tsx`, `app/providers/` (QueryClient, ErrorBoundary, MotionConfig), router mounting only `/` → `LeadIntakeScreen`. No `/closer/*`.

### Out of Scope (explicit non-goals)

- **F1 stops at persist + carril.** It shows the outcome and stops. It does **not** navigate to, trigger, or build any event/callback hook for F2.1/F2.2 — those owners read the persisted `carril` themselves.
- F3/F4, `/closer/*` routes, `requireCloser`.
- Real WhatsApp Business API, real CRM, real DataCrédito / any bureau, credit approval.
- Running or fixing the `analysis/` pipeline and `data/*.json` placeholders (owned by the data role). F1 only consumes the `DataCatalogPort` output contract.
- **Any edit to `contracts.ts`.** F1 consumes it as-is; a discovered gap becomes a separate announced backend change + `contracts:sync`, never a silent frontend edit.
- **Self-service deletion (*derecho de supresión*, Ley 1581).** F1 persists `LeadProfile` to Supabase (D10) but ships no delete endpoint. Product-owner decision: this is a documented gap for the "qué necesitamos de Colsubsidio" integration slide, not a feature to build now. Anyone extending F1 to a real deployment must close this before real titulares' data accumulates unbounded in `lead_profiles`.

## Capabilities

### New Capabilities

- `lead-intake-conversation` (back): consent gate, slot-filling turn loop, LLM parsing boundary, progress.
- `lead-intake-profiling` (back): affiliation check, capacity band, deterministic score with `factores`.
- `lead-intake-matching` (back): eligibility filter + project match with `razon`.
- `lead-intake-routing` (back): `decideViability` → `RoutingDecision` + persistence.
- `lead-intake-screen` (front): WhatsApp-style self-guided chat UI and its states.
- `app-bootstrap` (both): minimal composition roots and health check.

### Modified Capabilities

None — `openspec/specs/` is currently empty.

## Approach

Backend: pure deterministic functions in `domain/`, orchestrated by class-per-use-case in `application/`, exposed via a zod-validated Express controller. `Result`/`err` from `kernel/` for every expected flow (`ConsentRequiredError`, `ValidationError`, `DataUnavailableError`) — no throw/catch for business outcomes. The LLM is reachable **only** through `LlmPort.extractSlotValue` and `writeExplanation`; its output is zod-validated before entering the domain.

**DATA_UNAVAILABLE is a first-class branch, not an afterthought.** When `DataCatalogPort` returns `DataUnavailableError`, the use case must **not** fabricate a score or a carril. It propagates a typed, explainable outcome that the conversation surfaces as its own UX state (design phase specifies the exact shape). The frontend covers demo/dev visuals with its own fixtures, separately.

Frontend: `ui/` is presentational, `model/` holds turn state, `api/` is the only I/O, always via `API_ROUTES`. No business logic in `.tsx` — score, capacity and carril come from the backend.

## Affected Areas

| Repo | Area | Impact | Note |
|---|---|---|---|
| back | `src/features/lead-intake/**` | New | Vertical slice + module |
| back | `src/shared/domain/lead.ts`, `value-objects/salary-range.ts` | Modified | **Shared — announce** |
| back | `src/app.ts`, `src/main.ts` | New | **Bootstrap — announce** |
| back | `tests/**` | New | Domain is deterministic → unit-tested (strict TDD) |
| front | `src/features/lead-intake/**` | New | Slice + fixtures |
| front | `src/main.tsx`, `src/app/**` | New | **Bootstrap — announce** |

## Hard Constraints (non-negotiable)

- Consent gate first: no profiling and **no persistence** without `consentimiento.otorgado === true`; `versionPolitica` must be the current one → else `ConsentRequiredError`.
- **No `estrato`** as a scoring variable. `FileDataCatalogAdapter` hard-rejects any `estrato` weight key at runtime — do not work around it.
- COP values arrive already normalized as integer pesos. Never multiply/divide by 1000 anywhere.
- Glass-box: no classification without `ScoreResult.factores`. The LLM never scores, classifies or decides.
- UX: infer before asking, ~5–6 real questions max, tappable options + free text.
- zod at every controller boundary; no PII in logs (keep pino `redact`); no `any`, no `@ts-ignore`.
- UI copy says "estimado", never "aprobado".
- Feature isolation enforced by ESLint: public surface is `contracts.ts` / `lead-intake.module.ts` / frontend `index.ts` only.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `rangoSalarial` / `segmentoFamiliar` vocab not finalized (typed `string` in contracts) | High | Treat as opaque strings; centralize the accepted set in one domain module; align with the data role before scoring is tuned |
| Uncalibrated `data/*.json` → `DATA_UNAVAILABLE` on every scoring call | High | Design an explicit conversational outcome for it; frontend fixtures keep the demo reviewable |
| **400-line review budget** — 2 repos, 4 sub-modules, 2 bootstraps | High | Recommend chained PRs: (1) back domain+shared stubs+tests, (2) back application/interface/module+bootstrap, (3) front slice+fixtures, (4) front bootstrap+routing |
| Bootstrap collides with another dev's shared/bootstrap work | Medium | Announce before merging; keep `app.ts` free of F2–F4 wiring |
| Contract gap found mid-build | Medium | Backend change + `contracts:sync` + announcement; never a local frontend edit |
| LLM free-text parsing returns junk | Medium | zod-validate LLM output; `StubLlmAdapter` is the default; fall back to quick replies |

## Rollback Plan

All F1 code is new files in `features/lead-intake/**` plus the two bootstrap entry points → revert = drop the feature branch. The only pre-existing files touched are the four shared-domain stubs; rolling back restores their `throw new Error('TODO: not implemented')` bodies. Persistence is in-memory: no migrations, no data to reverse. `contracts.ts` is untouched, so no `contracts:sync` rollback is needed.

## Dependencies

- Calibrated `data/weights.json` + `data/project_profiles.json` (data role) — **not blocking**: F1 must ship handling `DATA_UNAVAILABLE`.
- Backend must be reachable at `localhost:3000` for the frontend proxy in dev; frontend fixtures cover the gap until then.

## Open Questions (for design)

1. Exact UX/typed shape of the `DATA_UNAVAILABLE` outcome inside `ConversationTurn` (no `carril` may be invented).
2. `hasConsent` must check the current `versionPolitica`, but `domain` may not read `env` — the version must be injected. Design must pick the injection point.

## Success Criteria

- [ ] A judge completes the flow unaided, from consent to outcome, in ≤5–6 questions.
- [ ] `carril` is always accompanied by `ScoreResult.factores` and a natural-language `explicacion`; nothing unexplained is shown.
- [ ] Declining consent blocks profiling and persists nothing.
- [ ] With placeholder data, the chat degrades into an explicit, non-broken state — never a fabricated score.
- [ ] `npm run verify` passes in both repos (`contracts:check` included; `contracts.ts` unchanged).
- [ ] `GET /api/health` responds and `/` renders `LeadIntakeScreen` from a clean checkout.
