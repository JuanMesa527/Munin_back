# Proposal: F5 · call-simulation (cross-repo: Munin_back + Munin_front)

> **Canonical copy.** Mirror pointer: `Munin_front/openspec/changes/call-simulation/proposal.md`.
> Cross-repo change: both task lists must land together for F5 to be demoable.
> Depends on F3/F4 contracts (`BriefingSheet`, `TalkingPoint`, `ObjecionSugerida`) already
> shipped by `lead-intake` — no dependency on the F3/F4 *backend*, which does not exist yet
> (the front runs F3/F4 entirely off `SEED_BRIEFINGS`; see Approach).

## Intent

F4 hands the closer a briefing sheet and a call button that is explicitly mock
(`briefing-header.tsx`: `"Los controles de llamada son MOCK: no hay telefonia integrada"`). The
product claims the briefing makes closing easy, but nothing measures that claim. F5 closes the
gap with a closing trainer: pressing "Iniciar llamada" opens a voice roleplay against an AI
persona built from that lead's own profile, and hanging up produces a scorecard — did the closer
close, which objections got resolved, which talking points got used. That scorecard is the
demo's strongest argument in front of a jury: the briefing's usefulness becomes measurable, not
asserted.

Dialogue engine: DeepSeek (adapter already exists for `LlmPort`, reused as a sibling adapter
under a new port). Voice: Amazon Polly (`generative` engine, `es-MX`/`es-US` — no `es-CO` voice
exists). Closer input: browser microphone (Web Speech API) with a always-visible text fallback.

## Scope

### In Scope — Munin_back

- `src/features/call-simulation/{domain,application,infrastructure,interface}/` +
  `call-simulation.module.ts` (`{ router }`).
- Deterministic domain: `persona` (PII-free context + system prompt per difficulty),
  `temperature` (interest delta, clamped 0-100), `coverage` (talking points / objections
  touched), `compliance` (forbidden-promise detection), `verdict` (`CallOutcome` + score).
- New port `CallSimulatorPort` (sibling of `LlmPort`, NOT an extension of it — see Approach) +
  `SpeechSynthesisPort` + `CallSessionStorePort`.
- Adapters: `DeepSeekCallSimulatorAdapter`, `StubCallSimulatorAdapter` (scripted, zero network),
  `PollySpeechAdapter`, `NoopSpeechAdapter`, `InMemoryCallSessionStore`.
- Three zod-validated endpoints under `API_ROUTES.closer.call.{start,turn,end}`.
- New rate limiter (`simulationRateLimiter`, 40 turns / 5 min per IP) in `security.ts`.
- **Shared-file changes (announce to team, rule 16):** `contracts.ts` adenda A11 — already
  applied (`CallDifficulty`, `CallMood`, `CallOutcome`, `SimulatedVoice`, `CallTurnAudio`,
  `CallTurn`, `PersonaContext`, `CallSimulationSession`, `CallScorecard`;
  `API_ROUTES.closer.call` string → `{start,turn,end}`). `env.ts` — `CALL_SIM_PROVIDER`,
  `SPEECH_PROVIDER`, `AWS_REGION`, `POLLY_ENGINE`, `POLLY_VOICE_{FEMALE,MALE}`, both already
  applied with fail-early validation mirroring the existing `deepseek`/`supabase` checks.
- New dependency: `@aws-sdk/client-polly` (backend only — see Approach for why this doesn't
  violate rule 19).

### In Scope — Munin_front

- `src/features/call-simulation/{ui,model,api}/` — call overlay, difficulty picker, scorecard.
- Hooks: `use-simulated-call` (state machine), `use-speech-recognition` (Web Speech API, with
  `soportado: boolean` for graceful degradation), `use-audio-playback`.
- Minimal ambient declaration for `webkitSpeechRecognition` (not in `lib.dom`).
- Wiring into `briefing-header.tsx`: the "Iniciar llamada" button opens the difficulty picker
  instead of only toggling the mock timer.

### Out of Scope (explicit non-goals)

- **Real telephony.** No number is dialed; `revealContact` is untouched.
- **Interruptions.** Turns are strictly alternating; barge-in requires bidirectional streaming,
  out of scope for a single-day build.
- **Persisted call history.** Session lives in memory and dies with the process.
  `CallSessionStorePort` is the seam for a future Supabase adapter.
- **F3/F4 backend.** Still doesn't exist. F5 does not wait on it (see Approach).
- **Blind-mode comparison** (same persona with the briefing hidden, to contrast performance).
  Discussed and deferred; the scorecard already records which talking points were ignored, which
  is the data a future blind-mode feature would need.

## Capabilities

### New Capabilities

- `call-simulation-conversation` (back): persona construction (PII-free), difficulty-scaled
  system prompts, per-turn LLM roleplay boundary.
- `call-simulation-voice` (back): text-to-speech synthesis, provider-swappable, never blocking
  the conversation when unavailable.
- `call-simulation-verdict` (back): deterministic outcome + scorecard from an ended session.
- `call-simulation-interface` (back): zod-validated Express controller + module boundary.
- `call-simulation-overlay` (front): call UI, difficulty selection, live transcript, scorecard
  rendering.

### Modified Capabilities

None outside `contracts.ts` (adenda A11, additive — no existing field changed or removed).

## Approach

**Why a new port, not a new `LlmPort` method.** `llm.port.ts` states explicitly: *"PROHIBIDO
agregar aqui un metodo que puntue, clasifique, ordene, decida"*. Roleplay is a third capability
the existing two-method contract was never meant to carry, and glass-box only holds if the
port's surface stays exactly what the docstring promises. `CallSimulatorPort` lives in
`call-simulation/application/ports/`, following the existing precedent of `lead-enrichment`
keeping `swipe-store.port.ts` and `telemetry.port.ts` local rather than promoting them to
`shared/`.

**Why the LLM never decides the outcome.** Same glass-box discipline as scoring: the LLM returns
zod-validated JSON per turn (`{ respuesta, mood, deltaInteres, objecionesPlanteadas,
objecionesResueltas }`); `domain/verdict.ts` — pure, unit-tested — turns the accumulated turns
into `CallOutcome` and a score via a fixed threshold per difficulty. If a judge asks "why does it
say this call closed," the answer is arithmetic, not model opinion.

**Why `PersonaContext` travels from front to back instead of the backend loading the lead.** The
leads visible in the closer dashboard (`l1`–`l6`, `Munin_front/src/shared/demo/leads.seed.ts`)
do not exist in the backend's demo seed (`demo-familia-soacha`, `demo-joven-bogota`,
`demo-alto-bogota`, plain `LeadProfile` without the A8 fields). If `start` loaded from
`LeadRepository` by `leadId`, every lead currently on screen would 404. `start` therefore accepts
`leadId` **plus** a `PersonaContext` derived from the `BriefingSheet` the front already holds in
memory, zod-validated and length-capped server-side. `// TODO F5:` marks the use case for when an
F3/F4 backend exists and `start` can drop the payload in favor of a repository lookup.

**Why `PersonaContext` carries no PII.** Mirrors the existing DeepSeek adapter's rule 4 ("Nada de
PII en el prompt"). `domain/persona.ts` keeps only first name + profile attributes (age,
occupation, city, savings, SMMLV multiple, objections, verbatim quote) — never phone, last name,
or document number. Unit-tested with a case asserting the built prompt string does not contain
the phone field.

**Why `@aws-sdk/client-polly` is a justified dependency despite rule 19** ("no metas una libreria
por una llamada POST", the reason DeepSeek goes over raw `fetch`). Polly requires SigV4 request
signing — HMAC-SHA256 over canonical requests, ~150 lines to hand-roll correctly — which is
exactly the class of complexity rule 19 is not aimed at. The SDK's default credential chain
picks up the already-verified local AWS CLI profile with zero extra configuration.

**Rollback plan.** Additive-only at the contract level (adenda A11 adds fields/routes, changes
nothing existing). Rollback is: revert the `call-simulation` feature folder, revert the
`contracts.ts`/`env.ts` diffs, re-run `contracts:sync`, unmount the router line in `app.ts`. No
persistence migrations to reverse — the call session store is in-memory only.
