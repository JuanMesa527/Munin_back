/**
 * Analista apagado. Capa: infrastructure (adapter de `CallHighlightsPort`).
 *
 * Es lo que corre con `CALL_SIM_PROVIDER=stub`: la demo funciona sin llave de
 * DeepSeek y el veredicto se muestra completo, solo sin la narrativa.
 */

import type { CallHighlights } from '@contracts';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err } from '../../../shared/kernel/result.js';
import type {
  CallHighlightsInput,
  CallHighlightsPort,
} from '../application/ports/call-highlights.port.js';

export class NoopHighlightsAdapter implements CallHighlightsPort {
  analizar(_input: CallHighlightsInput): Promise<Result<CallHighlights>> {
    return Promise.resolve(
      err(new DataUnavailableError('Analisis de llamada deshabilitado en este entorno')),
    );
  }
}
