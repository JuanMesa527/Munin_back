/**
 * Caso de uso: registrar un evento de progreso del journey. Capa: application.
 *
 * Detras de `POST /api/leads/education/progress`. Cuando el avance completa las
 * metas criticas, el lead se RECLASIFICA a `viable` y vuelve a la tuberia: ese
 * es el corazon de F2.2 (no descartar al no viable, nutrirlo).
 *
 * La decision de readmision es del DOMINIO (`checkReadmission`), determinista y
 * explicable. Aqui solo se orquesta y se persiste.
 */

import type { EducationJourney, IsoDateTime, ProgressEvent } from '@contracts';
import type {
  ClockPort,
  EducationJourneyRepository,
  IdGeneratorPort,
  LeadRepository,
} from '@shared/application/ports/index.js';
import { ValidationError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';
import { configureFechaObjetivo, trackProgress } from '../domain/journey.js';

export interface RecordProgressDeps {
  readonly journeys: EducationJourneyRepository;
  readonly leads: LeadRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export class RecordProgressUseCase {
  constructor(private readonly deps: RecordProgressDeps) {}

  /**
   * `fechaObjetivo` es OPCIONAL y ortogonal al evento: cuando viaja, configura
   * la fecha limite de `event.metaId` (via `configureFechaObjetivo`, que NO
   * toca `alcanzado`/`completada`/`aportes`) ADEMAS de aplicar el evento de
   * progreso normal. Son dos actualizaciones independientes sobre el mismo
   * journey, encadenadas antes de un unico `save`.
   */
  async execute(
    leadId: string,
    event: ProgressEvent,
    fechaObjetivo?: IsoDateTime | null,
  ): Promise<Result<EducationJourney>> {
    const actual = await this.deps.journeys.findByLeadId(leadId);
    if (!actual.ok) {
      return err(actual.error);
    }

    const now = this.deps.clock.now();
    let journey = actual.value;

    if (fechaObjetivo !== undefined && fechaObjetivo !== null) {
      if (event.metaId === null) {
        return err(
          new ValidationError('fechaObjetivo requiere una meta', { metaId: 'requerido' }),
        );
      }
      journey = configureFechaObjetivo(journey, event.metaId, fechaObjetivo, now);
    }

    const yaEraViable = journey.reclasificadoAViable;
    const actualizado = trackProgress(journey, event, now, this.deps.ids.newId());

    const guardado = await this.deps.journeys.save(actualizado);
    if (!guardado.ok) {
      return err(guardado.error);
    }

    // La reclasificacion se propaga al perfil UNA sola vez, en el flanco de
    // subida: reescribir el carril en cada evento posterior seria ruido.
    if (!yaEraViable && guardado.value.reclasificadoAViable) {
      const promovido = await this.promoverAViable(leadId);
      if (!promovido.ok) {
        return err(promovido.error);
      }
    }

    return ok(guardado.value);
  }

  private async promoverAViable(leadId: string): Promise<Result<true>> {
    const lead = await this.deps.leads.findById(leadId);
    if (!lead.ok) {
      return err(lead.error);
    }

    const guardado = await this.deps.leads.save({
      ...lead.value,
      carril: 'viable',
      updatedAt: this.deps.clock.now(),
    });
    return guardado.ok ? ok(true) : err(guardado.error);
  }
}
