/**
 * Lo que estos tests fijan es literalmente la pregunta que abrio el cambio:
 * ¿la nota y el estado se GUARDAN de verdad? Antes la UI decia "nota adjunta a
 * la ficha" y no persistia nada.
 */

import { describe, expect, it } from 'vitest';
import type { EnrichedLead } from '@contracts';
import type { AuditEntry, AuditLogPort } from '../../../shared/application/ports/audit-log.port.js';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import { NotFoundError } from '../../../shared/kernel/errors.js';
import { err, ok } from '../../../shared/kernel/result.js';
import { RegistrarGestionUseCase } from './registrar-gestion.use-case.js';

const AHORA = '2026-07-25T16:00:00.000Z';

function crearDeps(leadInicial: EnrichedLead | null): {
  deps: { leads: LeadRepository; clock: ClockPort; audit: AuditLogPort };
  guardados: EnrichedLead[];
  auditados: AuditEntry[];
} {
  const guardados: EnrichedLead[] = [];
  const auditados: AuditEntry[] = [];

  const leads = {
    findEnrichedById: () =>
      Promise.resolve(
        leadInicial === null ? err(new NotFoundError('Lead enriquecido no encontrado')) : ok(leadInicial),
      ),
    saveEnriched: (lead: EnrichedLead) => {
      guardados.push(lead);
      return Promise.resolve(ok(lead));
    },
  } as unknown as LeadRepository;

  return {
    deps: {
      leads,
      clock: { now: () => AHORA, nowMs: () => Date.parse(AHORA) },
      audit: {
        record: (registro: AuditEntry) => {
          auditados.push(registro);
          return Promise.resolve();
        },
      },
    },
    guardados,
    auditados,
  };
}

const LEAD = { id: 'lead-1', gestion: null } as unknown as EnrichedLead;

describe('RegistrarGestionUseCase', () => {
  it('persiste el estado y la nota en el lead', async () => {
    const { deps, guardados } = crearDeps(LEAD);

    const resultado = await new RegistrarGestionUseCase(deps).execute({
      leadId: 'lead-1',
      estado: 'agendado',
      nota: 'Quedamos en visitar el proyecto el sábado.',
      closerId: 'closer.demo',
    });

    expect(resultado.ok).toBe(true);
    expect(guardados).toHaveLength(1);
    expect(guardados[0]?.gestion).toEqual({
      estado: 'agendado',
      nota: 'Quedamos en visitar el proyecto el sábado.',
      closerId: 'closer.demo',
      registradoEn: AHORA,
    });
  });

  it('una nota vacia se guarda como null, no como cadena vacia', async () => {
    const { deps, guardados } = crearDeps(LEAD);

    await new RegistrarGestionUseCase(deps).execute({
      leadId: 'lead-1',
      estado: 'sin_contacto',
      nota: '   ',
      closerId: 'closer.demo',
    });

    expect(guardados[0]?.gestion?.nota).toBeNull();
    expect(guardados[0]?.gestion?.estado).toBe('sin_contacto');
  });

  it('el closerId es el de la sesion, y la gestion queda auditada', async () => {
    const { deps, guardados, auditados } = crearDeps(LEAD);

    await new RegistrarGestionUseCase(deps).execute({
      leadId: 'lead-1',
      estado: 'contactado',
      nota: null,
      closerId: 'closer.real',
    });

    expect(guardados[0]?.gestion?.closerId).toBe('closer.real');
    expect(auditados).toHaveLength(1);
    expect(auditados[0]).toMatchObject({
      actorId: 'closer.real',
      accion: 'registrar_gestion',
      recursoId: 'lead-1',
      resultado: 'permitido',
    });
  });

  it('si el lead no existe no se guarda ni se audita nada', async () => {
    const { deps, guardados, auditados } = crearDeps(null);

    const resultado = await new RegistrarGestionUseCase(deps).execute({
      leadId: 'fantasma',
      estado: 'agendado',
      nota: 'x',
      closerId: 'closer.demo',
    });

    expect(resultado.ok).toBe(false);
    expect(guardados).toHaveLength(0);
    expect(auditados).toHaveLength(0);
  });

  it('registrar una gestion nueva reemplaza la anterior', async () => {
    const conGestion = {
      id: 'lead-1',
      gestion: { estado: 'contactado', nota: 'primera', closerId: 'otro', registradoEn: '2026-07-24T10:00:00.000Z' },
    } as unknown as EnrichedLead;
    const { deps, guardados } = crearDeps(conGestion);

    await new RegistrarGestionUseCase(deps).execute({
      leadId: 'lead-1',
      estado: 'agendado',
      nota: 'segunda',
      closerId: 'closer.demo',
    });

    expect(guardados[0]?.gestion?.estado).toBe('agendado');
    expect(guardados[0]?.gestion?.nota).toBe('segunda');
  });
});
