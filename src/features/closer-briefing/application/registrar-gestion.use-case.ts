/**
 * Registra el resultado de la llamada y la nota del closer. Capa: application.
 *
 * POR QUE EXISTE: "Notas de la llamada" era un mock. La nota vivia en el estado
 * de React y se perdia al recargar, pero la UI respondia "nota adjunta a la
 * ficha" — le mentia al comercial sobre algo que ya habia pasado. O se
 * persiste, o el boton no promete nada.
 *
 * `closerId` NO viene del body: sale de la sesion ya verificada por
 * `requireCloser`. Si viniera del cliente, cualquiera firmaria la gestion con
 * el nombre de otro (OWASP A01).
 */

import type { EnrichedLead, EstadoGestion } from '@contracts';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port.js';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';

/** Nota acotada: es texto libre que termina en la base y en la ficha. */
export const MAX_LARGO_NOTA = 2000;

export interface RegistrarGestionDeps {
  readonly leads: LeadRepository;
  readonly clock: ClockPort;
  readonly audit: AuditLogPort;
}

export interface RegistrarGestionInput {
  readonly leadId: string;
  readonly estado: EstadoGestion;
  readonly nota: string | null;
  readonly closerId: string;
}

export class RegistrarGestionUseCase {
  constructor(private readonly deps: RegistrarGestionDeps) {}

  async execute(input: RegistrarGestionInput): Promise<Result<EnrichedLead>> {
    const actual = await this.deps.leads.findEnrichedById(input.leadId);
    if (!actual.ok) {
      return actual;
    }

    const ahora = this.deps.clock.now();
    const nota = input.nota === null ? null : input.nota.trim();

    const enriquecido: EnrichedLead = {
      ...actual.value,
      gestion: {
        estado: input.estado,
        // Una nota vacia es "no escribio nada", no una cadena vacia guardada.
        nota: nota === null || nota.length === 0 ? null : nota,
        closerId: input.closerId,
        registradoEn: ahora,
      },
      updatedAt: ahora,
    };

    const guardado = await this.deps.leads.saveEnriched(enriquecido);
    if (!guardado.ok) {
      return guardado;
    }

    // Queda traza de quien movio el estado de un lead: la gestion comercial
    // sobre un titular es tratamiento de sus datos, igual que leer su telefono.
    await this.deps.audit.record({
      actorId: input.closerId,
      accion: 'registrar_gestion',
      recursoId: input.leadId,
      resultado: 'permitido',
      ocurridoEn: ahora,
    });

    return ok(guardado.value);
  }
}
