/**
 * Puerto de persistencia del journey gamificado de nutricion (F2.2).
 * Capa: application (puerto compartido). F4 lo lee para armar la ficha del
 * closer, por eso el puerto es compartido y no interno de la feature.
 */

import type { EducationJourney } from '@contracts';
import type { Result } from '../../kernel/result.js';

export interface EducationJourneyRepository {
  save(journey: EducationJourney): Promise<Result<EducationJourney>>;
  /** El journey se identifica por el lead: hay a lo sumo uno vivo por lead. */
  findByLeadId(leadId: string): Promise<Result<EducationJourney>>;
}
