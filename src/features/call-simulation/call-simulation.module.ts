/**
 * Composition root de F5. Es lo UNICO que `app.ts` conoce de esta feature.
 * Mismo patron que `lead-enrichment.module.ts`: recibe los puertos ya
 * construidos (la eleccion memoria/red vive en `app.ts` + `call-simulation.factory.ts`).
 */

import type { Router } from 'express';
import type { ClockPort } from '../../shared/application/ports/clock.port.js';
import type { IdGeneratorPort } from '../../shared/application/ports/id-generator.port.js';
import type { CallSessionStorePort } from './application/ports/call-session-store.port.js';
import type { CallSimulatorPort } from './application/ports/call-simulator.port.js';
import type { SpeechSynthesisPort } from './application/ports/speech-synthesis.port.js';
import type { SpeechTranscriptionPort } from './application/ports/speech-transcription.port.js';
import type { CallHighlightsPort } from './application/ports/call-highlights.port.js';
import type { CallRecordingStorePort } from './application/ports/call-recording.store.js';
import { EndCallUseCase } from './application/end-call.use-case.js';
import { ProcessCallTurnUseCase } from './application/process-call-turn.use-case.js';
import { StartCallUseCase } from './application/start-call.use-case.js';
import { TranscribeUtteranceUseCase } from './application/transcribe-utterance.use-case.js';
import { createCallSimulationRouter } from './interface/call-simulation.controller.js';

export interface CallSimulationModuleDeps {
  readonly callSimulator: CallSimulatorPort;
  readonly speech: SpeechSynthesisPort;
  readonly transcription: SpeechTranscriptionPort;
  readonly highlights: CallHighlightsPort;
  readonly recordings: CallRecordingStorePort;
  readonly sessions: CallSessionStorePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export interface CallSimulationModule {
  readonly router: Router;
}

export function createCallSimulationModule(deps: CallSimulationModuleDeps): CallSimulationModule {
  return {
    router: createCallSimulationRouter({
      startCall: new StartCallUseCase(deps),
      processCallTurn: new ProcessCallTurnUseCase(deps),
      endCall: new EndCallUseCase(deps),
      transcribeUtterance: new TranscribeUtteranceUseCase(deps),
    }),
  };
}
