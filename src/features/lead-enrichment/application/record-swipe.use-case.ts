/**
 * Caso de uso: registrar una decision sobre una tarjeta y devolver el progreso.
 * Capa: application.
 *
 * Se persiste swipe a swipe en vez de mandar la baraja entera al final porque
 * el usuario puede abandonar a la mitad, y un abandono con 6 tarjetas vistas ya
 * es informacion util para el closer. Ademas hace que el resumen de F2.1 no
 * dependa de que el cliente le devuelva un estado que podria haber manipulado
 * (OWASP: no confiar en el estado que vive en el navegador).
 *
 * Cada swipe se guarda con el glass-box del match CONGELADO (similitud, razon,
 * factores) y con la telemetria de la tarjeta (dwell, si abrio el detalle). El
 * "por que" se recalcula aqui sobre la ficha real, no se recibe del cliente:
 * asi lo que se persiste es el mismo explicable que se le mostro.
 */

import type { ProjectCard, SwipeAction, SwipeEvent } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { DataCatalogPort } from '../../../shared/application/ports/data-catalog.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import {
  cabeEnCapacidad,
  calcularFactores,
  explicarMatch,
  similitudDe,
} from '../domain/matching.js';
import type { SwipeMatchContext, SwipeStorePort } from './ports/swipe-store.port.js';
import type { SwipeResuelto } from '../domain/swipes.js';
import { calcularIntentScore } from '../domain/swipes.js';

export interface RecordSwipeDeps {
  readonly swipes: SwipeStorePort;
  readonly catalogo: DataCatalogPort;
  readonly clock: ClockPort;
  /** Se usa para congelar el glass-box del match al momento de decidir. */
  readonly leads: LeadRepository;
}

export interface RecordSwipeInput {
  readonly leadId: string;
  readonly proyectoId: string;
  readonly accion: SwipeAction;
  /** --- Telemetria opcional de la tarjeta --- */
  readonly dwellMs?: number | undefined;
  readonly abrioDetalle?: boolean | undefined;
  readonly detalleMs?: number | undefined;
}

export interface RecordSwipeOutput {
  /** Cuantas tarjetas lleva decididas el lead. */
  decididas: number;
  /** Intencion recalculada con este swipe ya incluido. */
  intentScore: number;
  ultimo: SwipeEvent;
}

/**
 * Cruza swipes con fichas. Un swipe cuyo proyecto ya no esta en el catalogo se
 * DESCARTA en vez de romper: el catalogo puede cambiar entre que se armo la
 * baraja y que el usuario la termina.
 */
export function resolverSwipes(
  eventos: readonly SwipeEvent[],
  fichas: readonly ProjectCard[],
): SwipeResuelto[] {
  const porId = new Map(fichas.map((ficha) => [ficha.proyectoId, ficha]));
  return eventos.flatMap((evento) => {
    const ficha = porId.get(evento.proyectoId);
    return ficha === undefined ? [] : [{ evento, ficha }];
  });
}

export class RecordSwipeUseCase {
  constructor(private readonly deps: RecordSwipeDeps) {}

  async execute(input: RecordSwipeInput): Promise<Result<RecordSwipeOutput>> {
    // Se valida que el proyecto exista ANTES de guardar: sin esto, el cliente
    // podria sembrar el store con ids arbitrarios (entrada no confiable).
    const ficha = await this.deps.catalogo.getProjectCard(input.proyectoId);
    if (!ficha.ok) {
      return ficha;
    }

    const evento: SwipeEvent = {
      leadId: input.leadId,
      proyectoId: input.proyectoId,
      accion: input.accion,
      decididoEn: this.deps.clock.now(),
      dwellMs: input.dwellMs ?? null,
      abrioDetalle: input.abrioDetalle ?? false,
      detalleMs: input.detalleMs ?? null,
    };

    // Contexto del match congelado. Best-effort: si el lead no se encuentra, se
    // registra el swipe igual (la baraja ya paso los gates en build-deck).
    const contexto = await this.contextoDeMatch(input.leadId, ficha.value);

    const guardados = await this.deps.swipes.record(evento, contexto);
    if (!guardados.ok) {
      return guardados;
    }

    const catalogo = await this.deps.catalogo.getProjectCatalog();
    if (!catalogo.ok) {
      return catalogo;
    }

    const resueltos = resolverSwipes(guardados.value, catalogo.value.proyectos);

    return ok({
      decididas: resueltos.length,
      intentScore: calcularIntentScore(resueltos),
      ultimo: evento,
    });
  }

  /**
   * Congela el "por que te lo mostramos" tal como estaba al decidir. Se calcula
   * en el servidor sobre la ficha real, nunca se recibe del cliente, para que lo
   * persistido no se pueda contradecir con lo que vio el usuario.
   */
  private async contextoDeMatch(
    leadId: string,
    ficha: ProjectCard,
  ): Promise<SwipeMatchContext | undefined> {
    const lead = await this.deps.leads.findById(leadId);
    if (!lead.ok) {
      return undefined;
    }
    const factores = calcularFactores(lead.value, ficha);
    return {
      similitud: similitudDe(factores),
      razon: explicarMatch(lead.value, ficha),
      cabeEnCapacidad: cabeEnCapacidad(lead.value.capacidad, ficha),
      factores,
    };
  }
}
