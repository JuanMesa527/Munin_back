# Tasks: F5 · call-simulation (cross-repo: Munin_back + Munin_front)

> **Canonical copy.** Mirror pointer: `Munin_front/openspec/changes/call-simulation/tasks.md`.
> Reads: `proposal.md`, `specs/call-simulation-{conversation,voice,verdict,interface}`
> (backend), `specs/call-simulation-overlay` (frontend, in the front repo's openspec tree).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1,800–2,200 total across both repos |
| 400-line budget risk | Medium — split by phase below |
| Chained PRs recommended | Yes |
| Suggested split | 6 phases below |
| Delivery strategy | ask-on-risk (Phase 4 touches paid external APIs) |

## Phase 1 · Contracts + config (Munin_back, shared-file — announced)

- [x] 1.1 `contracts.ts` adenda A11: new types + `API_ROUTES.closer.call` → object.
- [x] 1.2 `npm run contracts:sync`; verify frontend copy matches (sha256).
- [x] 1.3 `env.ts`: `CALL_SIM_PROVIDER`, `SPEECH_PROVIDER`, `AWS_REGION`, `POLLY_ENGINE`,
      `POLLY_VOICE_{FEMALE,MALE}` + fail-early check mirroring the `deepseek`/`supabase` pattern.
- [x] 1.4 `.env.example` + local `.env` updated (no real secrets committed).
- [x] 1.5 `tests/app.test.ts` `fakeEnv()` fixture updated for the new required `AppEnv` fields.

## Phase 2 · Pure domain (Munin_back) — TDD, per `strict_tdd: true`

- [ ] 2.1 `domain/persona.ts` (`buildPersonaContext`, `buildSystemPrompt`) + test: no PII
      (phone) in built prompt (spec: `call-simulation-conversation`, req. "PersonaContext
      Contains No PII").
- [ ] 2.2 `domain/temperature.ts` (`applyDelta`, clamp 0-100) + tests: clamping at both bounds.
- [ ] 2.3 `domain/coverage.ts` (`computeCoverage`) + test: every talking point index appears in
      exactly one of used/ignored (spec: `call-simulation-verdict`, req. "Coverage Reflects
      Actual Talking Point Usage").
- [ ] 2.4 `domain/compliance.ts` (`detectForbiddenPromises`) + test: flags "está aprobado" and
      variants; does not flag "estimado".
- [ ] 2.5 `domain/verdict.ts` (`computeVerdict`) + tests: reproducibility (spec req.
      "Outcome Is Computed by a Pure Function"), difficulty raises threshold (spec req.
      "Difficulty Scales the System Prompt, Not the Verdict Threshold Alone"), curve length
      matches turn count.

## Phase 3 · Ports + use cases + stub adapters (Munin_back) — runnable without any API key

- [ ] 3.1 `application/ports/{call-simulator,speech-synthesis,call-session-store}.port.ts`.
- [ ] 3.2 `application/start-call.use-case.ts`, `process-call-turn.use-case.ts`,
      `end-call.use-case.ts`.
- [ ] 3.3 `infrastructure/stub-call-simulator.adapter.ts` — scripted per-objection responses.
- [ ] 3.4 `infrastructure/noop-speech.adapter.ts`, `in-memory-call-session.store.ts`.
- [ ] 3.5 `infrastructure/call-simulation.factory.ts` — provider selection from `AppEnv`.
- [ ] 3.6 `interface/call-simulation.dto.ts` (zod schemas) + `.controller.ts`
      (`validateBody` on all three routes) + `call-simulation.module.ts`.
- [ ] 3.7 `security.ts`: `simulationRateLimiter` (40/5min) + test asserting it's stricter than
      `publicRateLimiter` (spec req. "Dedicated Rate Limiter Stricter Than the Public Limiter").
- [ ] 3.8 Mount in `app.ts`. Manual check: `POST start` → `turn` → `end` round-trips with
      `CALL_SIM_PROVIDER=stub`, `SPEECH_PROVIDER=none`.

## Phase 4 · Real adapters (Munin_back) — needs `DEEPSEEK_API_KEY` + AWS creds

- [ ] 4.1 `infrastructure/deepseek-call-simulator.adapter.ts` — mirrors
      `deepseek-llm.adapter.ts` (fetch, `response_format: json_object`, zod, delimited user
      message per spec req. "Closer Text Is Delimited, Never Concatenated Into the System
      Prompt"); `temperature: 0.8`; reply capped ~320 chars.
- [ ] 4.2 `npm i @aws-sdk/client-polly`; `infrastructure/polly-speech.adapter.ts` — deterministic
      voice per lead, `generative`→`neural` fallback (spec req. "Engine Fallback on Rejection"),
      never blocks the turn on failure (spec req. "Speech Synthesis Never Blocks the
      Conversation").
- [ ] 4.3 Wire both into `call-simulation.factory.ts`.
- [ ] 4.4 Manual check against real DeepSeek + Polly with one seeded lead.

## Phase 5 · Frontend (Munin_front)

- [ ] 5.1 `api/call-simulation.api.ts` (`startCall`, `sendCallTurn`, `endCall`).
- [ ] 5.2 `model/use-simulated-call.ts` — state machine
      (`idle→marcando→sonando→en_llamada→colgada→veredicto`).
- [ ] 5.3 `model/use-speech-recognition.ts` (Web Speech API, `soportado` flag) +
      `shared/speech/speech-recognition.d.ts`.
- [ ] 5.4 `model/use-audio-playback.ts`.
- [ ] 5.5 `ui/difficulty-picker.tsx`, `ui/call-overlay.tsx` (built on `shared/ui/modal.tsx`),
      `ui/call-scorecard.tsx` (recharts for `curvaInteres`).
- [ ] 5.6 Wire into `briefing-header.tsx`: button opens picker → overlay; update the file's
      "MOCK" docstring; "Silenciar" mutes Polly audio playback.
- [ ] 5.7 `SIMULACIÓN · NO ES UNA LLAMADA REAL` badge in the overlay.

## Phase 6 · Verification

- [ ] 6.1 `npm run verify` in both repos (`contracts:check`, `typecheck`, `lint`, `test`, and
      `build` for the backend).
- [ ] 6.2 Manual end-to-end per plan's Verification section (stub mode, real mode, mic denied,
      backend down mid-call, forbidden-promise alert, no PII in logs).

## Decision needed before apply

None — difficulty levels, verdict scoring, and the PersonaContext shape are settled in
`proposal.md`'s Approach section.
