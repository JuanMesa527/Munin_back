/**
 * Archivo de llamadas apagado. Capa: infrastructure
 * (adapter de `CallRecordingStorePort`).
 *
 * Lo que corre con `PERSISTENCE_DRIVER=memory`: la llamada se entrena y se
 * evalua igual, simplemente no queda historico. Es el modo de la demo sin
 * credenciales, no un estado de error.
 */

import type { CallRecord, CallRecordingRef } from '@contracts';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import type {
  AudioParaGuardar,
  CallRecordingStorePort,
} from '../application/ports/call-recording.store.js';

export class NoopCallRecordingStore implements CallRecordingStorePort {
  // `ok` y no `err`: no guardar cuando el archivo esta apagado es el
  // comportamiento correcto, no un fallo que haya que loguear en cada llamada.
  guardar(_registro: CallRecord): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  subirAudios(_callId: string, _audios: readonly AudioParaGuardar[]): Promise<CallRecordingRef[]> {
    return Promise.resolve([]);
  }
}
