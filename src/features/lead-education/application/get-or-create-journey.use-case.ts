/**
 * Caso de uso: obtener el journey de nutricion de un lead, creandolo si es la
 * primera vez. Capa: application.
 *
 * Detras de `GET/POST /api/leads/education/journey`. Es idempotente: si el lead
 * ya tiene journey se devuelve tal cual, para que recargar la pantalla no
 * reinicie el progreso del usuario.
 *
 * Siempre adjunta `EducationLeadSnapshot` desde el `LeadProfile` real de F1
 * — el front de F2.2 no debe inventar nombre/ciudad/ahorro.
 */

import type {
  ContenidoEducativo,
  EducationJourney,
  EducationJourneyView,
  EducationLeadSnapshot,
  EtapaId,
  LeadProfile,
  ProjectProfile,
  RoutingDecision,
} from '@contracts';
import { ETAPAS_CAMINO } from '@contracts';
import type {
  ClockPort,
  DataCatalogPort,
  EducationJourneyRepository,
  LeadRepository,
} from '@shared/application/ports/index.js';
import { maskPhone } from '@shared/domain/phone.js';
import { ValidationError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';
import { buildEducationalContent } from '../domain/content.js';
import { buildGamifiedJourney } from '../domain/journey.js';
import { computeNurturePlan } from '../domain/nurture-plan.js';
import { PROYECTO_POR_DEFECTO, elegirProyectoObjetivo } from '../domain/target-project.js';

export type JourneyView = EducationJourneyView;

export interface GetOrCreateJourneyDeps {
  readonly journeys: EducationJourneyRepository;
  readonly leads: LeadRepository;
  readonly catalog: DataCatalogPort;
  readonly clock: ClockPort;
}

export class GetOrCreateJourneyUseCase {
  constructor(private readonly deps: GetOrCreateJourneyDeps) {}

  async execute(leadId: string): Promise<Result<JourneyView>> {
    const lead = await this.deps.leads.findById(leadId);
    if (!lead.ok) {
      return err(lead.error);
    }
    const profile = lead.value;

    if (profile.carril === 'viable') {
      return err(
        new ValidationError('Este lead es viable: no entra al carril de nutrición', {
          carril: 'no_viable requerido',
        }),
      );
    }

    const existente = await this.deps.journeys.findByLeadId(leadId);
    if (existente.ok) {
      return ok(this.vista(existente.value, profile));
    }

    const proyecto = await this.resolverProyectoObjetivo(profile);
    const plan = computeNurturePlan(profile, proyecto);
    if (!plan.ok) {
      return err(plan.error);
    }

    const journey = buildGamifiedJourney({
      profile,
      routing: routingDe(profile),
      plan: plan.value,
      now: this.deps.clock.now(),
    });

    const guardado = await this.deps.journeys.save(journey);
    if (!guardado.ok) {
      return err(guardado.error);
    }
    return ok(this.vista(guardado.value, profile));
  }

  /**
   * El proyecto objetivo sale del catalogo calibrado. Si `analysis/` todavia no
   * corrio, el catalogo responde `DataUnavailableError` y caemos a un proyecto
   * por defecto: preferimos una demo que camina a una pantalla en 503.
   */
  private async resolverProyectoObjetivo(profile: LeadProfile): Promise<ProjectProfile> {
    const proyectos = await this.deps.catalog.getProjectProfiles();
    if (!proyectos.ok || proyectos.value.length === 0) {
      return PROYECTO_POR_DEFECTO;
    }
    return elegirProyectoObjetivo(profile, proyectos.value);
  }

  private vista(journey: EducationJourney, profile: LeadProfile): JourneyView {
    const etapas: EtapaId[] = (journey.etapas ?? [...ETAPAS_CAMINO]).map((etapa) => etapa.id);
    const contenidos: ContenidoEducativo[] = etapas.flatMap((etapa) =>
      buildEducationalContent(etapa),
    );
    return {
      journey,
      contenidos,
      lead: snapshotDe(profile),
    };
  }
}

export function snapshotDe(profile: LeadProfile): EducationLeadSnapshot {
  return {
    leadId: profile.id,
    nombre: profile.nombre,
    email: profile.email,
    telefonoEnmascarado: profile.telefono === null ? null : maskPhone(profile.telefono),
    edad: profile.edad,
    estadoCivil: profile.estadoCivil,
    esAfiliado: profile.esAfiliado,
    rangoSalarial: profile.rangoSalarial,
    segmento: profile.segmento,
    personasACargo: profile.personasACargo,
    ciudad: profile.ciudad,
    segmentoFamiliar: profile.segmentoFamiliar,
    ahorroDeclarado: profile.ahorroDeclarado,
    capacidadAhorroMensual: profile.capacidadAhorroMensual,
    score: profile.score?.valor ?? null,
    banda: profile.capacidad?.banda ?? null,
    cuotaMensualEstimada: profile.capacidad?.cuotaMensualEstimada ?? null,
    precioMaximoEstimado: profile.capacidad?.precioMaximoEstimado ?? null,
    proyectos: profile.proyectos,
  };
}

/**
 * F1 persiste el carril en el perfil, pero no la `RoutingDecision` completa.
 * Reconstruimos la minima necesaria para el journey; cuando F1 exponga la
 * decision persistida, esto se reemplaza por ese dato.
 */
function routingDe(profile: LeadProfile): RoutingDecision {
  return {
    carril: 'no_viable',
    razones: profile.ahorroDeclarado === null ? ['datos_insuficientes'] : ['ahorro_insuficiente'],
    explicacion: 'Todavía no, pero acá está tu camino.',
    decididoEn: profile.updatedAt,
  };
}
