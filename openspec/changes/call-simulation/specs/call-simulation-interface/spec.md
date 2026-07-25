# call-simulation-interface Specification

## Purpose

Zod-validated Express controller and DTOs exposing `API_ROUTES.closer.call.*`, the
`call-simulation.module.ts` composition root as the feature's only public surface, and the rate
limiter protecting the (paid, per-turn) DeepSeek + Polly calls.

## Requirements

### Requirement: Zod Validation at Every Endpoint

Every endpoint under `API_ROUTES.closer.call.*` (`start`, `turn`, `end`) MUST validate its
request body through `validate.ts` zod middleware before any use case executes.

#### Scenario: Malformed start request is rejected before use case

- GIVEN a POST to `API_ROUTES.closer.call.start` missing `leadId` or `dificultad`
- WHEN the request is validated
- THEN `ValidationError` (`VALIDATION_ERROR`) is returned and `StartCallUseCase` never executes

### Requirement: Feature Isolation via Module Boundary

The backend MUST expose `call-simulation` functionality only through
`call-simulation.module.ts` (`{ router }`). No other feature or `app.ts` MAY import internals
from `src/features/call-simulation/{domain,application,infrastructure,interface}/`.

#### Scenario: Only the module is imported by the composition root

- GIVEN `app.ts` mounts the call-simulation router
- WHEN its imports are inspected
- THEN it imports only `call-simulation.module.ts`, never a `domain/` or `application/` file
  directly

### Requirement: Dedicated Rate Limiter Stricter Than the Public Limiter

`API_ROUTES.closer.call.*` MUST be protected by a dedicated `simulationRateLimiter` (40 requests
/ 5 minutes per IP), separate from `publicRateLimiter` (60 / 5 min). Each turn costs both
DeepSeek tokens and Polly characters, so the ceiling MUST be tighter than the public flow's.

#### Scenario: Simulation limiter is stricter than the public one

- GIVEN `security.ts` after this change
- WHEN `simulationRateLimiter.limit` and `publicRateLimiter.limit` are compared
- THEN `simulationRateLimiter.limit < publicRateLimiter.limit`

### Requirement: No PII in Logs

Controllers and use cases MUST NOT log raw `PersonaContext`, turn transcripts, or any personal
data outside the existing pino `redact` configuration.

#### Scenario: Turn payload is not logged raw

- GIVEN a request to `API_ROUTES.closer.call.turn` carrying free-text closer speech
- WHEN the request is processed and logged
- THEN the log entry contains no raw PII fields outside the configured redaction list

### Requirement: Session State Never Reaches the Client Directly

`CallSessionStorePort` state (the running `CallTurn[]` accumulator) MUST stay server-side. The
client receives only the single new `CallTurn` per `turn` call and the final `CallScorecard` on
`end` — never the full server-side session object.

#### Scenario: Turn response contains only the new turn, not the whole history

- GIVEN a call already has 4 prior turns in `CallSessionStorePort`
- WHEN `POST .../call/turn` is called for turn 5
- THEN the response body's `data` is a single `CallTurn` (turn 5), not an array of all 5
