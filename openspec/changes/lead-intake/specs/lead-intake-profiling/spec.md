# lead-intake-profiling Specification

## Purpose

Deterministic, explainable affiliation check, capacity estimation, and scoring
over a filled `LeadProfile`. No LLM involvement in any decision.

## Requirements

### Requirement: Pure, LLM-Free Scoring Functions

`checkAffiliation`, `estimateCapacity`, and `scoreLead` MUST be pure functions
of their typed inputs. None of them MAY take an `LlmPort` dependency or call
any LLM adapter. Given the same inputs, they MUST return the same outputs.

#### Scenario: scoreLead has no LLM dependency

- GIVEN the exported signature of `scoreLead`
- WHEN inspected
- THEN its parameter list contains no `LlmPort` and no adapter capable of
  network or nondeterministic behavior

### Requirement: Every Score Carries Explainable Factors

`scoreLead` MUST return a `ScoreResult` whose `factores: Factor[]` is
non-empty whenever a score is produced. If a score cannot be legitimately
calculated (e.g. `DataUnavailableError`), the system MUST NOT show a partial
`ScoreResult` without factors — no score is shown at all in that case.

#### Scenario: Score without factors is never returned

- GIVEN calibrated weights are available
- WHEN `scoreLead` computes a `ScoreResult`
- THEN `factores` contains at least one weighted, named factor with `contribucion`

### Requirement: No `estrato` as a Scoring Variable

`scoreLead` and `getTopFactors` MUST NOT reference an `estrato` field or weight
key anywhere in their logic, consistent with `FileDataCatalogAdapter`'s
runtime rejection of any `estrato` weight key.

#### Scenario: Weights containing estrato are rejected upstream

- GIVEN `data/weights.json` were to contain an `estrato` key
- WHEN `FileDataCatalogAdapter` loads it
- THEN it rejects at runtime, and `scoreLead` never receives or computes an
  `estrato`-derived factor

### Requirement: Affiliation Is One Weighted Factor, Not a Gate

`checkAffiliation` MUST produce a factor consumed by `scoreLead`/routing, and
MUST NOT itself halt the conversation or force early routing when
`esAfiliado === false`.

#### Scenario: Non-affiliate still receives a full score

- GIVEN `esAfiliado: false` and all other slots filled
- WHEN `scoreLead` runs
- THEN it returns a `ScoreResult` including an affiliation-related `Factor`
  alongside other weighted factors, not an early rejection

### Requirement: COP Values Are Integer, Never Rescaled

`estimateCapacity` MUST treat all `COP` inputs/outputs as already-normalized
integer pesos. It MUST NOT multiply or divide any COP value by 1000 or any
other scaling factor.

#### Scenario: Capacity band uses raw COP as received

- GIVEN `ahorroDeclarado: 5000000` (five million pesos, integer)
- WHEN `estimateCapacity` computes `precioMaximoEstimado`
- THEN the result is expressed in the same unscaled integer peso scale
