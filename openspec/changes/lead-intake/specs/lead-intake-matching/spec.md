# lead-intake-matching Specification

## Purpose

Deterministic eligibility filtering and project matching with explainable
`razon` per match, using the calibrated data catalog only.

## Requirements

### Requirement: Pure, LLM-Free Matching Functions

`matchProjects`, `filterByEligibility`, and `explainMatch` MUST be pure
functions and MUST NOT take an `LlmPort` dependency. `explainMatch` composes
the natural-language `razon` from deterministic inputs (not free-form LLM
generation) unless routed through `LlmPort.writeExplanation` purely for
wording, never for deciding which projects match.

#### Scenario: matchProjects has no LLM dependency

- GIVEN the exported signature of `matchProjects`
- WHEN inspected
- THEN it contains no `LlmPort` parameter

### Requirement: Every Match Has a Reason

Every `ProjectMatch` returned by `matchProjects` MUST include a non-empty
`razon` string grounded in the buyer-persona similarity that produced it.

#### Scenario: Matched project includes a grounded reason

- GIVEN a `LeadProfile` with capacity and segment filled
- WHEN `matchProjects` returns matches
- THEN each `ProjectMatch.razon` references the concrete similarity factor,
  never a placeholder or empty string

### Requirement: DATA_UNAVAILABLE Propagates, Never Fabricated

When the data catalog cannot supply project profiles, `matchProjects` MUST
propagate the `DataUnavailableError` outcome rather than returning an empty
or fabricated `proyectos` list disguised as a valid result.

#### Scenario: No project profiles available

- GIVEN `DataCatalogPort` returns `DataUnavailableError` for project profiles
- WHEN the use case calls `matchProjects`
- THEN the typed unavailable outcome propagates up to the conversation use case
- AND no `ProjectMatch[]` is fabricated
