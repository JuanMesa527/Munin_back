import type { LeadContactInput, LeadContactLookupPort } from '../../../application/ports/lead-contact-lookup.port.js';
import { NotFoundError } from '../../../kernel/errors.js';
import type { Result } from '../../../kernel/result.js';
import { err, ok } from '../../../kernel/result.js';
import type { InMemoryLeadRepository } from './in-memory-lead.repository.js';

/** Envuelve la MISMA instancia de `InMemoryLeadRepository` que usa F1/F2.1/F3. */
export class InMemoryLeadContactLookup implements LeadContactLookupPort {
  constructor(private readonly leads: InMemoryLeadRepository) {}

  findLeadIdByContact(contact: LeadContactInput): Promise<Result<string>> {
    const encontrado = this.leads.findByContact(contact);
    if (encontrado === null) {
      return Promise.resolve(err(new NotFoundError('No existe un lead con ese contacto')));
    }
    return Promise.resolve(ok(encontrado.id));
  }

  async findContactByLeadId(leadId: string): Promise<Result<LeadContactInput>> {
    const encontrado = await this.leads.findById(leadId);
    if (!encontrado.ok) return encontrado;
    return ok({ telefono: encontrado.value.telefono, email: encontrado.value.email });
  }
}
