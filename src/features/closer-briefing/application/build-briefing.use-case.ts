import type {
  BriefingSheet,
  EducationJourney,
  EnrichedLead,
  ObjecionSugerida,
  TalkingPoint,
} from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { EducationJourneyRepository } from '../../../shared/application/ports/education-repository.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import { NotFoundError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';

function buildTalkingPoints(lead: EnrichedLead, journey: EducationJourney | null): TalkingPoint[] {
  const points: TalkingPoint[] = [];
  const strongestFactor = lead.score?.factores.toSorted(
    (left, right) => right.contribucion - left.contribucion,
  )[0];

  if (lead.score !== null) {
    points.push({
      titulo: `Score ${String(lead.score.valor)}/100`,
      detalle:
        strongestFactor === undefined
          ? 'Confirmar las señales que sostienen la viabilidad.'
          : `${strongestFactor.nombre}: ${strongestFactor.valor}.`,
      origen: 'score',
      prioridad: 1,
    });
  }

  const topMatch = lead.proyectos[0];
  if (topMatch !== undefined) {
    points.push({
      titulo: topMatch.nombre,
      detalle: topMatch.razon,
      origen: 'matching',
      prioridad: 2,
    });
  }

  if (lead.capacidad !== null) {
    points.push({
      titulo: `Capacidad ${lead.capacidad.banda}`,
      detalle:
        lead.capacidad.precioMaximoEstimado === null
          ? 'Validar la informacion faltante antes de hablar de montos.'
          : `Techo estimado de vivienda: $${lead.capacidad.precioMaximoEstimado.toLocaleString('es-CO')}.`,
      origen: 'capacidad',
      prioridad: 3,
    });
  }

  if (lead.intereses.length > 0) {
    points.push({
      titulo: 'Intereses declarados',
      detalle: lead.intereses.join(', '),
      origen: 'intereses',
      prioridad: 4,
    });
  }

  if (journey !== null) {
    points.push({
      titulo: 'Recorrido de nutricion',
      detalle: `Progreso alcanzado: ${String(Math.round(journey.progreso * 100))}%.`,
      origen: 'nutricion',
      prioridad: 5,
    });
  }

  return points;
}

function buildScoreSummary(lead: EnrichedLead): string {
  if (lead.score === null) return 'Score aun no calculado.';
  const strongestFactor = lead.score.factores.toSorted(
    (left, right) => right.contribucion - left.contribucion,
  )[0];
  if (strongestFactor === undefined) return `Score ${String(lead.score.valor)}/100.`;
  return `Score ${String(lead.score.valor)}/100, impulsado principalmente por ${strongestFactor.nombre.toLowerCase()}.`;
}

function buildObjections(lead: EnrichedLead): ObjecionSugerida[] {
  const objections: ObjecionSugerida[] = [];
  const topMatch = lead.proyectos[0];

  if (
    topMatch !== undefined &&
    lead.capacidad?.precioMaximoEstimado !== null &&
    lead.capacidad?.precioMaximoEstimado !== undefined &&
    topMatch.precioDesde > lead.capacidad.precioMaximoEstimado
  ) {
    objections.push({
      pregunta: '¿Ese proyecto cabe en mi presupuesto?',
      respuesta:
        'Presentar la capacidad como una estimacion y revisar alternativas, sin prometer aprobacion de credito.',
    });
  } else if (lead.capacidad !== null) {
    objections.push({
      pregunta: '¿La capacidad estimada garantiza que me aprueben?',
      respuesta:
        'Aclarar que es una banda basada en datos declarados y que la aprobacion corresponde a la entidad financiera.',
    });
  }

  if (lead.intereses.length > 0) {
    objections.push({
      pregunta: '¿El proyecto responde a lo que estoy buscando?',
      respuesta: `Conectar la conversacion con estos intereses declarados: ${lead.intereses.join(', ')}.`,
    });
  }

  return objections;
}

function buildAlerts(lead: EnrichedLead): string[] {
  const alerts: string[] = [];
  if (lead.consentimiento?.otorgado !== true) {
    alerts.push('No hay consentimiento vigente para contacto comercial.');
  }
  if (lead.esAfiliado === false) {
    alerts.push('Lead no afiliado: validar disponibilidad dentro del cupo comercial.');
  }
  if (lead.score === null) alerts.push('El lead no tiene score calculado.');
  if (lead.capacidad === null) alerts.push('La capacidad aun no esta estimada.');
  return alerts;
}

export class BuildBriefingUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly journeys: EducationJourneyRepository,
    private readonly clock: ClockPort,
  ) {}

  async execute(leadId: string): Promise<Result<BriefingSheet>> {
    const leadResult = await this.leads.findEnrichedById(leadId);
    if (!leadResult.ok) return leadResult;

    const journeyResult = await this.journeys.findByLeadId(leadId);
    let journey: EducationJourney | null;
    if (journeyResult.ok) {
      journey = journeyResult.value;
    } else if (journeyResult.error instanceof NotFoundError) {
      journey = null;
    } else {
      return journeyResult;
    }

    const lead = leadResult.value;
    return ok({
      lead,
      journey,
      talkingPoints: buildTalkingPoints(lead, journey),
      alertas: buildAlerts(lead),
      generadoEn: this.clock.now(),
      resumenScore: buildScoreSummary(lead),
      objeciones: buildObjections(lead),
    });
  }
}
