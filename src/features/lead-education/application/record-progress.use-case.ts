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

import type { EducationJourney, ProgressEvent } from '@contracts';
import type {
  ClockPort,
  EducationJourneyRepository,
  LeadRepository,
} from '@shared/application/ports/index.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';
import { trackProgress } from '../domain/journey.js';

export interface RecordProgressDeps {
  readonly journeys: EducationJourneyRepository;
  readonly leads: LeadRepository;
  readonly clock: ClockPort;
}

export class RecordProgressUseCase {
  constructor(private readonly deps: RecordProgressDeps) {}

  async execute(leadId: string, event: ProgressEvent): Promise<Result<EducationJourney>> {
    const actual = await this.deps.journeys.findByLeadId(leadId);
    if (!actual.ok) {
      return err(actual.error);
    }

    const yaEraViable = actual.value.reclasificadoAViable;
    const actualizado = trackProgress(actual.value, event, this.deps.clock.now());

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
