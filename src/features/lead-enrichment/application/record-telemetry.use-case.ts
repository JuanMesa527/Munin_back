/**
 * Caso de uso: registrar la telemetria de atencion de una sesion de F2.1.
 * Capa: application.
 *
 * BEST-EFFORT a proposito: cuando el front manda este lote, el usuario ya
 * termino (o abandono) y sus swipes ya estan guardados. Un fallo del sink de
 * analitica no puede devolverle un error: se loguea y se responde ok. Por eso
 * los `Result` de los sub-guardados se consumen aqui y no se propagan.
 */

import type { EnrichmentTelemetry } from '@contracts';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import { logger } from '../../../shared/infrastructure/logging/logger.js';
import type { TelemetryStorePort } from './ports/telemetry.port.js';

export interface RecordTelemetryDeps {
  readonly telemetry: TelemetryStorePort;
}

export type RecordTelemetryInput = EnrichmentTelemetry;

export interface RecordTelemetryOutput {
  views: number;
  session: boolean;
}

export class RecordTelemetryUseCase {
  constructor(private readonly deps: RecordTelemetryDeps) {}

  async execute(input: RecordTelemetryInput): Promise<Result<RecordTelemetryOutput>> {
    const views = await this.deps.telemetry.recordViews(input.views);
    if (!views.ok) {
      logger.warn({ leadId: input.session.leadId }, 'telemetria de vistas no persistio');
    }

    const session = await this.deps.telemetry.recordSession(input.session);
    if (!session.ok) {
      logger.warn({ leadId: input.session.leadId }, 'telemetria de sesion no persistio');
    }

    return ok({ views: input.views.length, session: true });
  }
}
