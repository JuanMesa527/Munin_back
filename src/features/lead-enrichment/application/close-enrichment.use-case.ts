/**
 * Caso de uso: cerrar F2.1 y persistir el lead enriquecido.
 * Capa: application.
 *
 * Este es el punto en el que un lead viable pasa a existir para el closer: lo
 * que se guarde aqui es exactamente lo que F3 va a listar y F4 va a mostrar.
 */

import type { EducationJourney, EnrichmentSummary } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { DataCatalogPort } from '../../../shared/application/ports/data-catalog.port.js';
import type { EducationJourneyRepository } from '../../../shared/application/ports/education-repository.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import { ConsentRequiredError, ForbiddenError, NotFoundError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type { PreferenciaContacto } from '../domain/ficha.js';
import { matchProjects } from '../domain/matching.js';
import { enriquecerConSwipes, fichasGuardadas } from '../domain/swipes.js';
import { resolverSwipes } from './record-swipe.use-case.js';
import type { SwipeStorePort } from './ports/swipe-store.port.js';

export interface CloseEnrichmentDeps {
  readonly leads: LeadRepository;
  readonly swipes: SwipeStorePort;
  readonly catalogo: DataCatalogPort;
  readonly clock: ClockPort;
  /**
   * Puerto COMPARTIDO (no un internal de F2.2): el recorrido del lead necesita
   * el hito de nutricion, y ese dato solo lo tiene el journey. Sin esto la
   * ficha tendria que inventarse si el lead paso o no por educacion.
   */
  readonly journeys: EducationJourneyRepository;
}

export interface CloseEnrichmentInput {
  readonly leadId: string;
  /**
   * Dias y franjas que el titular elige al cerrar su perfil ("¿cuándo te
   * llamamos?"). OPCIONAL: si no responde, la ficha muestra "Sin franja
   * preferida" en vez de un horario inventado.
   */
  readonly preferenciaContacto?: PreferenciaContacto | null | undefined;
}

export class CloseEnrichmentUseCase {
  constructor(private readonly deps: CloseEnrichmentDeps) {}

  async execute(input: CloseEnrichmentInput): Promise<Result<EnrichmentSummary>> {
    const lead = await this.deps.leads.findById(input.leadId);
    if (!lead.ok) {
      return lead;
    }

    // Los mismos dos gates que `BuildDeckUseCase`: cerrar el enriquecimiento
    // persiste datos personales, asi que el consentimiento se vuelve a exigir
    // en vez de asumirse por haber pasado antes.
    if (lead.value.consentimiento?.otorgado !== true) {
      return err(new ConsentRequiredError());
    }
    if (lead.value.carril !== 'viable') {
      return err(
        new ForbiddenError('Este lead no esta en el carril de proyectos', {
          carril: 'F2.1 es solo para leads viables',
        }),
      );
    }

    const eventos = await this.deps.swipes.listByLead(input.leadId);
    if (!eventos.ok) {
      return eventos;
    }

    const catalogo = await this.deps.catalogo.getProjectCatalog();
    if (!catalogo.ok) {
      return catalogo;
    }

    // Un lead que nunca entro a nutricion no tiene journey: es un caso normal,
    // no un fallo. Cualquier OTRO error del repositorio si se propaga.
    const journeyResult = await this.deps.journeys.findByLeadId(input.leadId);
    let journey: EducationJourney | null;
    if (journeyResult.ok) {
      journey = journeyResult.value;
    } else if (journeyResult.error instanceof NotFoundError) {
      journey = null;
    } else {
      return journeyResult;
    }

    const resueltos = resolverSwipes(eventos.value, catalogo.value.proyectos);
    const ahora = this.deps.clock.now();
    const guardadas = fichasGuardadas(resueltos);

    // `LeadProfile.proyectos` pasa a ser lo que el usuario ELIGIO, no lo que el
    // algoritmo propuso: es lo que F4 lee para armar "proyectos afines y su
    // porque" en la ficha de llamada, y el closer necesita saber que le gusto
    // al cliente. El `razon` se recalcula sobre las mismas fichas guardadas,
    // asi que sigue siendo el explicable del glass-box.
    const enriquecido = {
      ...enriquecerConSwipes(lead.value, resueltos, ahora, {
        journey,
        preferenciaContacto: input.preferenciaContacto ?? null,
      }),
      proyectos: matchProjects(lead.value, guardadas).map((tarjeta) => tarjeta.match),
    };

    const persistido = await this.deps.leads.saveEnriched(enriquecido);
    if (!persistido.ok) {
      return persistido;
    }

    return ok({
      lead: persistido.value,
      guardados: guardadas,
      swipes: eventos.value,
    });
  }
}
