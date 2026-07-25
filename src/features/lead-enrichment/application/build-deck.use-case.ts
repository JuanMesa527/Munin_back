/**
 * Caso de uso: armar la baraja de proyectos afines a un lead viable.
 * Capa: application.
 *
 * Dos gates de negocio antes de mostrar nada:
 *   1. consentimiento otorgado (Ley 1581 de 2012);
 *   2. carril `viable` (F2.1 es el carril del viable; el no viable va a F2.2).
 *
 * Los dos se imponen AQUI y no en el controller: son reglas de negocio, y un
 * segundo consumidor del caso de uso tiene que heredarlas.
 */

import type { EnrichmentDeck, LeadProfile } from '@contracts';
import type { DataCatalogPort } from '../../../shared/application/ports/data-catalog.port.js';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import { ConsentRequiredError, ForbiddenError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import { matchProjects } from '../domain/matching.js';

export interface BuildDeckDeps {
  readonly leads: LeadRepository;
  readonly catalogo: DataCatalogPort;
  readonly clock: ClockPort;
}

export interface BuildDeckInput {
  readonly leadId: string;
  /** Cuantas tarjetas devolver. `undefined` = la baraja completa. */
  readonly limite?: number | undefined;
}

/** Gate legal: sin consentimiento no se perfila ni se muestra nada. */
function tieneConsentimiento(lead: LeadProfile): boolean {
  return lead.consentimiento?.otorgado === true;
}

export class BuildDeckUseCase {
  constructor(private readonly deps: BuildDeckDeps) {}

  async execute(input: BuildDeckInput): Promise<Result<EnrichmentDeck>> {
    const lead = await this.deps.leads.findById(input.leadId);
    if (!lead.ok) {
      return lead;
    }

    if (!tieneConsentimiento(lead.value)) {
      return err(new ConsentRequiredError());
    }

    if (lead.value.carril !== 'viable') {
      // 403 y no 404: el lead existe, pero este carril no es el suyo. El
      // mensaje no revela su score ni la razon de no viabilidad (OWASP A09).
      return err(
        new ForbiddenError('Este lead no esta en el carril de proyectos', {
          carril: 'F2.1 es solo para leads viables',
        }),
      );
    }

    const catalogo = await this.deps.catalogo.getProjectCatalog();
    if (!catalogo.ok) {
      return catalogo;
    }

    return ok({
      leadId: lead.value.id,
      tarjetas: matchProjects(lead.value, catalogo.value.proyectos, input.limite),
      catalogoVersion: catalogo.value.version,
      generadoEn: this.deps.clock.now(),
    });
  }
}
