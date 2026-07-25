# call-simulation-verdict Specification

## Purpose

Deterministic, explainable scoring of an ended call session. This is the capability that answers
"did the closer actually close" with arithmetic, not model opinion — the same glass-box
discipline `ScoreResult.factores` applies to lead scoring.

## Requirements

### Requirement: Outcome Is Computed by a Pure Function

`domain/verdict.ts` MUST compute `CallOutcome` and `puntaje` from the accumulated `CallTurn[]`
and `CallDifficulty` alone — no I/O, no LLM call at end-of-call time. Its explainability output
is `CallScorecard.explicacion` plus the itemized `talkingPointsUsados`/`Ignorados` and
`objecionesResueltas`/`Vivas` arrays (mirrors the `ScoreResult.factores` glass-box requirement
from the core scoring spec).

#### Scenario: Verdict is reproducible from turns alone

- GIVEN a fixed array of `CallTurn` and a `CallDifficulty`
- WHEN `computeVerdict` is called twice with the same inputs
- THEN both calls return an identical `CallScorecard` (same `outcome`, same `puntaje`)

### Requirement: Compliance Alerts Detect Forbidden Promises

`domain/compliance.ts` MUST scan the closer's turns (`CallTurn.closerDijo`) for language
promising approval or guaranteed outcomes (e.g. "está aprobado", "te lo aprueban", "seguro te dan
el subsidio") and MUST surface each match in `CallScorecard.alertas`. This MUST run independent
of `outcome` — a call can close AND still carry a compliance alert.

#### Scenario: A false promise is flagged even on a successful close

- GIVEN a call where the closer says "tu subsidio ya está aprobado" and the session ends with
  `outcome: 'agenda_visita'`
- WHEN `computeVerdict` (or a `compliance.ts` step within it) processes the turns
- THEN `CallScorecard.alertas` contains a non-empty entry referencing the forbidden promise

### Requirement: Coverage Reflects Actual Talking Point Usage

`domain/coverage.ts` MUST determine `talkingPointsUsados`/`talkingPointsIgnorados` by comparing
each `CallTurn.closerDijo` against `BriefingSheet.talkingPoints`, not by trusting a
closer-reported flag. Indices in both arrays MUST reference `BriefingSheet.talkingPoints` by
position, and every talking point index MUST appear in exactly one of the two arrays.

#### Scenario: Every talking point is accounted for exactly once

- GIVEN a `BriefingSheet` with 5 `talkingPoints` and a completed call
- WHEN `computeVerdict` builds the scorecard
- THEN `talkingPointsUsados.length + talkingPointsIgnorados.length === 5` and the two arrays
  share no index

### Requirement: Interest Curve Is Monotonically Recorded, Not Recomputed

`CallScorecard.curvaInteres` MUST be the turn-by-turn `interes` values as they occurred during
the call (from `domain/temperature.ts`'s clamped output each turn), not a smoothed or
recalculated series.

#### Scenario: Curve length matches turn count

- GIVEN a call with `n` processed turns after the opening
- WHEN the call ends
- THEN `CallScorecard.curvaInteres.length === n + 1` (including the opening turn's `interes`)
