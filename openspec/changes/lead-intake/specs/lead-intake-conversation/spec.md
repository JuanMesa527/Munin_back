# lead-intake-conversation Specification

## Purpose

Turn-based conversation engine that fills `LeadProfile` slots via a WhatsApp-style
chat, enforces the consent gate, and hands off a complete profile to profiling/matching/routing.

## Requirements

### Requirement: Consent Gate Enforced in Domain

The system MUST NOT score, match, route, or persist a `LeadProfile` unless
`hasConsent(profile)` returns `true`. `hasConsent` in `shared/domain/lead.ts`
MUST implement this check (currently a stub) and MUST consider a consent valid
only if `ConsentRecord.otorgado === true` AND its recorded `versionPolitica`
matches the currently active policy version. The exact mechanism by which the
active policy version reaches this domain-layer check (parameter, application
pass-through, etc.) is a `sdd-design` decision — `domain/` MUST NOT import `env`.

#### Scenario: Consent missing blocks profiling

- GIVEN a `LeadProfile` with `consentimiento: null`
- WHEN any turn attempts to advance past the consent step
- THEN the use case returns `ConsentRequiredError`
- AND no slot outside consent is filled, no score, match, or routing runs

#### Scenario: Consent refusal is respectful and retryable, not a dead end

- GIVEN the user is shown the consent step
- WHEN the user declines consent
- THEN nothing is persisted, the bot reply includes a link to `/politica-de-datos`
- AND the conversation session remains open — the accept action stays available
  and the user can grant consent later in the same session without reloading

#### Scenario: Consent version mismatch is treated as no consent

- GIVEN a `ConsentRecord` with `otorgado: true` but `versionPolitica` older than
  the currently active policy version
- WHEN `hasConsent` evaluates that profile
- THEN it returns `false`, equivalent to no consent granted

### Requirement: Bounded, Inference-First Question Flow

The system MUST ask at most ~5–6 real questions per conversation. `getNextStep`
MUST skip any slot already inferable from prior answers before presenting a
new question. Every question step MUST offer `QuickReply[]` tappable options
AND MUST still accept free text (`permiteTextoLibre`).

#### Scenario: Already-known slot is not re-asked

- GIVEN a slot's value can be inferred from an earlier answer
- WHEN `getNextStep` computes the next step
- THEN that slot is marked filled and is not presented as a question

#### Scenario: Free text is parsed through the LLM boundary only

- GIVEN a step accepts free text
- WHEN the user answers with a sentence instead of a quick reply
- THEN `parseAnswer` sends the raw text to `LlmPort.extractSlotValue` only
- AND the returned structured value is zod-validated before entering `updateProfile`

### Requirement: Non-Affiliation Never Short-Circuits the Flow

The system MUST continue asking all applicable questions regardless of
`esAfiliado`. Affiliation MUST be one input weighed by `decideViability`/
`scoreLead` at the end of the conversation, never a mid-flow stop condition.

#### Scenario: Non-affiliate completes the full question set

- GIVEN a lead answers `esAfiliado: false` early in the conversation
- WHEN the conversation continues
- THEN it keeps asking the remaining applicable questions (capacity, segment, etc.)
- AND the user is never told mid-flow "you don't qualify"
- AND a `carril` decision is only produced after the conversation reaches
  `isReadyToRoute`

### Requirement: DATA_UNAVAILABLE Is a First-Class, Honest Outcome

When `DataCatalogPort` returns `DataUnavailableError` after the conversation
is otherwise complete, the use case MUST NOT fabricate a `ScoreResult` or a
`carril` of `'viable'`/`'no_viable'`. The conversation MUST still finish
normally (all applicable questions asked/answered), the `LeadProfile` MUST be
persisted via `LeadRepository.save` with `carril: null`, `score: null`, and
`proyectos: []`, and `buildBotMessage` MUST produce an honest closing message
(e.g. "gracias, todavía no podemos calcular tu perfil, te contactaremos
pronto") — never a fake score.

#### Scenario: Scoring data unavailable at the end of a complete conversation

- GIVEN a `LeadProfile` with `hasConsent(profile) === true` and all applicable
  slots filled
- WHEN `DataCatalogPort` returns `DataUnavailableError` during scoring
- THEN the use case persists the `LeadProfile` with `carril: null`
- AND `ConversationTurn.routing` is `null`
- AND the final `BotMessage` states the profile could not be calculated yet,
  without inventing a score

### Requirement: Non-Classified Leads Are Persisted, Not Discarded

Because consent for `perfilamiento_vivienda` was already granted, a `LeadProfile`
that cannot be classified (`carril: null`) MUST still be persisted through the
same `LeadRepository.save` path used for viable/no_viable leads.

#### Scenario: Null-carril lead is saved

- GIVEN a `DATA_UNAVAILABLE` outcome as above
- WHEN the use case finishes the turn
- THEN `LeadRepository.save` is called exactly once with `carril: null`
- AND the saved profile has no `score` and an empty `proyectos` array

## Non-Requirements (explicit scope boundary)

- This capability decides and persists `carril`/`LeadProfile` and then stops.
  It MUST NOT navigate to, trigger, or build any hook/event for F2.1/F2.2.
