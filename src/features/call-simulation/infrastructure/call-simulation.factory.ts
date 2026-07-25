/**
 * Eleccion de adapters de F5 segun `AppEnv`. Capa: infrastructure.
 *
 * Unico lugar que sabe que implementacion concreta de `CallSimulatorPort` y
 * `SpeechSynthesisPort` esta activa — mismo patron que `llm.factory.ts` y
 * `persistence.factory.ts`. `CALL_SIM_PROVIDER=stub` + `SPEECH_PROVIDER=none`
 * es el default: la demo "llama" sin red y sin credenciales de AWS.
 */

import type { AppEnv } from '../../../shared/infrastructure/config/env.js';
import type { CallSimulatorPort } from '../application/ports/call-simulator.port.js';
import type { SpeechSynthesisPort } from '../application/ports/speech-synthesis.port.js';
import type { SpeechTranscriptionPort } from '../application/ports/speech-transcription.port.js';
import type { CallHighlightsPort } from '../application/ports/call-highlights.port.js';
import type { CallRecordingStorePort } from '../application/ports/call-recording.store.js';
import type { AppSupabaseClient } from '../../../shared/infrastructure/persistence/supabase/supabase-client.js';
import { StubCallSimulatorAdapter } from './stub-call-simulator.adapter.js';
import { DeepSeekCallSimulatorAdapter } from './deepseek-call-simulator.adapter.js';
import { NoopSpeechAdapter } from './noop-speech.adapter.js';
import { PollySpeechAdapter } from './polly-speech.adapter.js';
import { AwsTranscribeAdapter } from './aws-transcribe.adapter.js';
import { NoopTranscriptionAdapter } from './noop-transcription.adapter.js';
import { DeepSeekHighlightsAdapter } from './deepseek-highlights.adapter.js';
import { NoopHighlightsAdapter } from './noop-highlights.adapter.js';
import { SupabaseCallRecordingStore } from './supabase-call-recording.store.js';
import { NoopCallRecordingStore } from './noop-call-recording.store.js';

export function createCallSimulator(env: AppEnv): CallSimulatorPort {
  if (env.callSimProvider === 'deepseek') {
    // env.ts falla al arrancar si CALL_SIM_PROVIDER=deepseek sin DEEPSEEK_API_KEY,
    // asi que llegar aqui con la llave ausente es un bug de wiring, no un caso
    // de configuracion esperado.
    if (env.deepseekApiKey === null) {
      throw new Error(
        'CALL_SIM_PROVIDER=deepseek exige DEEPSEEK_API_KEY (deberia haber fallado en loadEnv)',
      );
    }
    return new DeepSeekCallSimulatorAdapter(env.deepseekApiKey, env.deepseekModel);
  }
  return new StubCallSimulatorAdapter();
}

export function createSpeechSynthesis(env: AppEnv): SpeechSynthesisPort {
  if (env.speechProvider === 'polly') {
    return new PollySpeechAdapter(
      env.awsRegion,
      env.pollyEngine,
      env.pollyVoiceFemale,
      env.pollyVoiceMale,
    );
  }
  return new NoopSpeechAdapter();
}

/**
 * Adenda A12. Va aparte de `createSpeechSynthesis` aunque comparta region y
 * credenciales: sintetizar y transcribir fallan por motivos distintos, y una
 * demo puede querer oir al lead sin pagar el dictado.
 */
export function createSpeechTranscription(env: AppEnv): SpeechTranscriptionPort {
  if (env.transcriptionProvider === 'aws') {
    return new AwsTranscribeAdapter(env.awsRegion);
  }
  return new NoopTranscriptionAdapter();
}

/**
 * El analista comparte proveedor con el roleplay (`CALL_SIM_PROVIDER`) porque
 * comparte la llave, pero NO comparte puerto: son prompts y fallos distintos.
 */
export function createCallHighlights(env: AppEnv): CallHighlightsPort {
  if (env.callSimProvider === 'deepseek' && env.deepseekApiKey !== null) {
    return new DeepSeekHighlightsAdapter(env.deepseekApiKey, env.deepseekModel);
  }
  return new NoopHighlightsAdapter();
}

/**
 * El archivo historico sigue a `PERSISTENCE_DRIVER`, no a un flag propio: si
 * hay Supabase para los leads, hay Supabase para las llamadas.
 */
export function createCallRecordingStore(
  env: AppEnv,
  supabase: AppSupabaseClient | null,
): CallRecordingStorePort {
  if (env.persistenceDriver === 'supabase' && supabase !== null) {
    return new SupabaseCallRecordingStore(supabase);
  }
  return new NoopCallRecordingStore();
}
