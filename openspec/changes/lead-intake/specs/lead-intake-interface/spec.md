# lead-intake-interface Specification

## Purpose

Zod-validated Express controller and DTOs exposing `API_ROUTES.intake.*`, and
the `lead-intake.module.ts` composition root as the feature's only public surface.

## Requirements

### Requirement: Zod Validation at Every Endpoint

Every endpoint under `API_ROUTES.intake.*` (`start`, `turn`, `consent`) MUST
validate its request body/params/query through the existing `validate.ts`
zod middleware before any use case executes.

#### Scenario: Malformed turn request is rejected before use case

- GIVEN a POST to `API_ROUTES.intake.turn` with a missing required field
- WHEN the request is validated
- THEN `ValidationError` (`VALIDATION_ERROR`) is returned and the use case
  never executes

### Requirement: Feature Isolation via Module Boundary

The backend MUST expose `lead-intake` functionality only through
`lead-intake.module.ts` (`{ router }`). No other feature or `app.ts` MAY
import internals from `src/features/lead-intake/{domain,application,infrastructure,interface}/`.

#### Scenario: Only the module is imported by the composition root

- GIVEN `app.ts` mounts the lead-intake router
- WHEN its imports are inspected
- THEN it imports only `lead-intake.module.ts`, never a `domain/` or
  `application/` file directly

### Requirement: No PII in Logs

Controllers and use cases MUST NOT log raw conversation payloads, `LeadProfile`
contents, or any personal data outside the existing pino `redact` configuration.

#### Scenario: Turn payload is not logged raw

- GIVEN a request to `API_ROUTES.intake.turn` with free-text user input
- WHEN the request is processed and logged
- THEN the log entry contains no raw PII fields outside the configured
  `redact` paths
