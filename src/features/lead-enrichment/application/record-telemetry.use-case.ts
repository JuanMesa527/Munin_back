/**
 * Caso de uso: registrar la telemetria de atencion de una sesion de F2.1.
 * Capa: application.
 *
 * BEST-EFFORT a proposito: cuando el front manda este lote, el usuario ya
 * termino (o abandono) y sus swipes ya estan guardados. Un fallo del sink de
 * analitica no puede devolverle un error: se loguea y se responde ok. Por eso
 * los `Result` de los sub-guardados se consumen aqui y no se propagan.
 */

import type { EnrichmentSessionSummary, ViewEvent } from '@contracts';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import { logger } from '../../../shared/infrastructure/logging/logger.js';
import type { TelemetryStorePort } from './ports/telemetry.port.js';

export interface RecordTelemetryDeps {
  readonly telemetry: TelemetryStorePort;
}

export interface RecordTelemetryInput {
  readonly leadId: string;
  readonly vistas: readonly ViewEvent[];
  readonly sesion: EnrichmentSessionSummary | null;
}

export interface RecordTelemetryOutput {
  vistas: number;
  sesion: boolean;
}

export class RecordTelemetryUseCase {
  constructor(private readonly deps: RecordTelemetryDeps) {}

  async execute(input: RecordTelemetryInput): Promise<Result<RecordTelemetryOutput>> {
    const vistas = await this.deps.telemetry.recordViews(input.leadId, input.vistas);
    if (!vistas.ok) {
      logger.warn({ leadId: input.leadId }, 'telemetria de vistas no persistio');
    }

    if (input.sesion !== null) {
      const sesion = await this.deps.telemetry.recordSession(input.leadId, input.sesion);
      if (!sesion.ok) {
        logger.warn({ leadId: input.leadId }, 'telemetria de sesion no persistio');
      }
    }

    return ok({ vistas: input.vistas.length, sesion: input.sesion !== null });
  }
}
