# call-simulation-voice Specification

## Purpose

Text-to-speech synthesis for the simulated lead's replies, provider-swappable via
`SpeechSynthesisPort`, and never a hard dependency for the conversation to function.

## Requirements

### Requirement: Speech Synthesis Never Blocks the Conversation

`ProcessCallTurnUseCase` MUST return a valid `CallTurn` (with `audio: null`) when
`SpeechSynthesisPort` fails or times out, rather than failing the whole turn. Voice is an
enhancement, not a precondition for the roleplay to continue.

#### Scenario: Polly failure degrades to text-only, not a broken turn

- GIVEN `SPEECH_PROVIDER=polly` and Polly returns a throttling error for a turn
- WHEN `ProcessCallTurnUseCase.execute` runs for that turn
- THEN the response is `ok` with a `CallTurn` whose `audio` field is `null`, and
  `leadRespondio` (the text) is still populated

### Requirement: SPEECH_PROVIDER=none Is a First-Class Mode

With `SPEECH_PROVIDER=none`, `NoopSpeechAdapter` MUST be wired by the factory and every
`CallTurn.audio` MUST be `null`. This MUST NOT be treated as a degraded/error state by the use
case — it is a supported, deliberate configuration for text-only demos.

#### Scenario: Text-only mode produces no synthesis attempt

- GIVEN `env.speechProvider === 'none'`
- WHEN `call-simulation.factory.ts` builds the module's dependencies
- THEN it wires `NoopSpeechAdapter`, and no network call to AWS is attempted for any turn

### Requirement: Voice Selection Is Deterministic Per Lead

Given the same `leadId` and the same env config (`POLLY_VOICE_FEMALE`, `POLLY_VOICE_MALE`), the
voice assigned to a `CallSimulationSession` MUST be the same across calls — no randomness in
voice selection.

#### Scenario: Same lead always gets the same voice

- GIVEN two separate `start` calls for the same `leadId`
- WHEN each builds its `SimulatedVoice`
- THEN both sessions carry the identical `voiceId`

### Requirement: Engine Fallback on Rejection

If Polly rejects a `generative`-engine request for the configured voice/account combination,
`PollySpeechAdapter` MUST retry once with the `neural` engine before surfacing a failure to the
use case.

#### Scenario: Generative rejection falls back to neural before giving up

- GIVEN Polly responds with a validation error for `Engine: generative` on a given voice
- WHEN `PollySpeechAdapter.synthesize` handles that response
- THEN it retries the same text with `Engine: neural` before returning a `Result`

### Requirement: No PII Reaches Polly Beyond the Reply Text

Only the LLM-generated reply text (already PII-free per `call-simulation-conversation`) MUST be
sent to `SynthesizeSpeechCommand`. No lead identifier, phone, or profile field MAY be included in
the Polly request beyond what is already embedded in the reply text itself.
