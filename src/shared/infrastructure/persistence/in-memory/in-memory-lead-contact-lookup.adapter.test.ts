import { describe, expect, it } from 'vitest';
import type { LeadProfile } from '@contracts';
import { NotFoundError } from '../../../kernel/errors.js';
import { leadProfile } from '../lead-repository.contract.js';
import { InMemoryLeadContactLookup } from './in-memory-lead-contact-lookup.adapter.js';
import { InMemoryLeadRepository } from './in-memory-lead.repository.js';

function leadProfileWithContact(id: string, telefono: string | null, email: string | null): LeadProfile {
  return { ...leadProfile(id), telefono, email };
}

describe('InMemoryLeadContactLookup', () => {
  it('resuelve el leadId por telefono', async () => {
    const leads = new InMemoryLeadRepository();
    await leads.save(leadProfileWithContact('lead-1', '+573001112233', null));
    const lookup = new InMemoryLeadContactLookup(leads);

    const result = await lookup.findLeadIdByContact({ telefono: '+573001112233', email: null });

    expect(result).toEqual({ ok: true, value: 'lead-1' });
  });

  it('resuelve el leadId por email', async () => {
    const leads = new InMemoryLeadRepository();
    await leads.save(leadProfileWithContact('lead-2', null, 'persona@correo.com'));
    const lookup = new InMemoryLeadContactLookup(leads);

    const result = await lookup.findLeadIdByContact({ telefono: null, email: 'persona@correo.com' });

    expect(result).toEqual({ ok: true, value: 'lead-2' });
  });

  it('devuelve NotFoundError cuando ningun lead coincide', async () => {
    const leads = new InMemoryLeadRepository();
    await leads.save(leadProfileWithContact('lead-3', '+573000000000', null));
    const lookup = new InMemoryLeadContactLookup(leads);

    const result = await lookup.findLeadIdByContact({ telefono: '+573009999999', email: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
  });
});
