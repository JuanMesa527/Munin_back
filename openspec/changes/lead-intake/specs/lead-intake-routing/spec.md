# lead-intake-routing Specification

## Purpose

Final deterministic decision (`RoutingDecision`) and persistence of the
resulting `LeadProfile`, including the honest `carril: null` outcome.

## Requirements

### Requirement: Pure, LLM-Free Routing Decision

`decideViability` MUST be a pure function of `ScoreResult`/`CapacityBand`/
affiliation inputs and MUST NOT take an `LlmPort` dependency. It decides
`Carril` ('viable' | 'no_viable') deterministically; it MUST NOT invoke any
LLM to decide.

#### Scenario: decideViability has no LLM dependency

- GIVEN the exported signature of `decideViability`
- WHEN inspected
- THEN it contains no `LlmPort` parameter

### Requirement: Consent Gate Enforced Before Persistence

`LeadRepository.save` MUST NOT be called unless `hasConsent(profile)` is
`true` at the moment of the call, for every outcome (`viable`, `no_viable`,
or `null`).

#### Scenario: No consent, no save

- GIVEN a profile without valid consent
- WHEN the routing use case reaches its final step
- THEN `LeadRepository.save` is never invoked and `ConsentRequiredError` is
  returned instead

### Requirement: Three Persisted Outcomes, Including Null Carril

The system MUST persist exactly one of three `LeadProfile.carril` outcomes:
`'viable'`, `'no_viable'`, or `null` (when `DataUnavailableError` prevented
scoring). All three MUST use the same `LeadRepository.save` path. A `null`
outcome MUST carry `score: null` and `proyectos: []`.

#### Scenario: Viable lead persisted with explanation

- GIVEN `decideViability` returns `carril: 'viable'`
- WHEN the use case persists the profile
- THEN `RoutingDecision.explicacion` is non-empty and `razones` is empty

#### Scenario: No-viable lead persisted with reasons

- GIVEN `decideViability` returns `carril: 'no_viable'`
- WHEN the use case persists the profile
- THEN `RoutingDecision.razones` contains at least one `NonViableReason`

#### Scenario: Null-carril lead persisted honestly

- GIVEN a `DataUnavailableError` outcome from profiling/matching
- WHEN the routing step runs
- THEN `LeadProfile.carril` is persisted as `null`, `ConversationTurn.routing`
  is `null`, and no `RoutingDecision` is fabricated

## Non-Requirements (explicit scope boundary)

- Routing MUST NOT navigate to, trigger, or build any extension hook for
  F2.1 (`lead-enrichment`) or F2.2 (`lead-education`). Those features read
  the persisted `carril` themselves; F1 stops after persist.
