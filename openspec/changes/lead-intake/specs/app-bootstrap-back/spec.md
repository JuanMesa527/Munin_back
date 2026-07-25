# app-bootstrap-back Specification

## Purpose

Minimal backend composition root (`app.ts`/`main.ts`) wiring security,
error handling, health check, and only the `lead-intake` module.

## Requirements

### Requirement: Minimal Composition Root

`app.ts` MUST wire `security.ts`, `errorHandler`, `GET /api/health`, and mount
only `lead-intake.module.ts`. It MUST select default adapters
(`StubLlmAdapter`, `InMemoryLeadRepository`, `FileDataCatalogAdapter`,
`SystemClockAdapter`, `CryptoIdGeneratorAdapter`) without wiring any F2–F4 module.

#### Scenario: Health check responds on a clean checkout

- GIVEN a fresh checkout with `npm install` and `.env` from `.env.example`
- WHEN `GET /api/health` is requested after `npm run dev`
- THEN it responds successfully without requiring an LLM API key

#### Scenario: No F2–F4 wiring present

- GIVEN `app.ts` as written by this change
- WHEN its module mounts are inspected
- THEN only `lead-intake.module.ts` is mounted; no route or adapter for
  `lead-enrichment`, `lead-education`, `closer-dashboard`, or `closer-briefing`
  exists
