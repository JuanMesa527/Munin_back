import { describe, expect, it, vi } from 'vitest';
import type { EnrichedLead } from '@contracts';
import type { ContactVaultPort } from '../../../shared/application/ports/contact-vault.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import { NotFoundError } from '../../../shared/kernel/errors.js';
import { ok } from '../../../shared/kernel/result.js';
import { RevealContactUseCase } from './reveal-contact.use-case.js';

const lead = {
  id: 'lead-1',
  identidad: {
    nombre: 'Ada',
    telefonoEnmascarado: '+57 3.. ... ..42',
    contactoTokenId: 'token-1',
  },
} as EnrichedLead;

describe('RevealContactUseCase', () => {
  it('delega el reveal auditado al vault con el closer de sesion', async () => {
    const leads = {
      findEnrichedById: vi.fn().mockResolvedValue(ok(lead)),
    } as unknown as LeadRepository;
    const revealForCall = vi.fn().mockResolvedValue(ok({ telefono: '+573001234567' }));
    const vault = { revealForCall } as unknown as ContactVaultPort;
    const useCase = new RevealContactUseCase(leads, vault);

    const result = await useCase.execute({ leadId: lead.id, closerId: 'closer-1' });

    expect(result).toEqual({ ok: true, value: { telefono: '+573001234567' } });
    expect(revealForCall).toHaveBeenCalledWith(lead.identidad?.contactoTokenId, 'closer-1');
  });

  it('no consulta el vault cuando el lead no tiene identidad de contacto', async () => {
    const leads = {
      findEnrichedById: vi.fn().mockResolvedValue(ok({ ...lead, identidad: null })),
    } as unknown as LeadRepository;
    const revealForCall = vi.fn();
    const vault = { revealForCall } as unknown as ContactVaultPort;
    const useCase = new RevealContactUseCase(leads, vault);

    const result = await useCase.execute({ leadId: lead.id, closerId: 'closer-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
    expect(revealForCall).not.toHaveBeenCalled();
  });
});
