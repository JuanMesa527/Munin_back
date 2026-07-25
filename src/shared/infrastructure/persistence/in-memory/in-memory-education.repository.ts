/**
 * Repositorio del journey de nutricion en memoria. Capa: infrastructure
 * (adapter de `EducationJourneyRepository`).
 * Driver por defecto del scaffolding: la demo de F2.2 corre sin base de datos.
 * Sin `async` porque no hay I/O; la firma del puerto es asincrona para que el
 * adapter real entre despues sin tocar los casos de uso.
 */

import type { EducationJourney } from '@contracts';
import type { EducationJourneyRepository } from '../../../application/ports/education-repository.port.js';
import { NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';

export class InMemoryEducationRepository implements EducationJourneyRepository {
  /** Clave = `leadId`: hay a lo sumo un journey vivo por lead. */
  private readonly journeys = new Map<string, EducationJourney>();

  save(journey: EducationJourney): Promise<Result<EducationJourney>> {
    // Copia defensiva: el progreso gamificado se muta mucho en F2.2 y no
    // queremos que el "almacenamiento" cambie por debajo del caso de uso.
    const guardado = structuredClone(journey);
    this.journeys.set(guardado.leadId, guardado);
    return Promise.resolve(ok(structuredClone(guardado)));
  }

  findByLeadId(leadId: string): Promise<Result<EducationJourney>> {
    const encontrado = this.journeys.get(leadId);
    if (encontrado === undefined) {
      return Promise.resolve(err(new NotFoundError('Este lead no tiene un plan de nutricion')));
    }
    return Promise.resolve(ok(structuredClone(encontrado)));
  }
}
