import type { ContactVaultPort } from '../../../shared/application/ports/contact-vault.port.js';
import type { LeadRepository } from '../../../shared/application/ports/lead-repository.port.js';
import { NotFoundError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err } from '../../../shared/kernel/result.js';

export interface RevealContactInput {
  readonly leadId: string;
  readonly closerId: string;
}

export class RevealContactUseCase {
  constructor(
    private readonly leads: LeadRepository,
    private readonly vault: ContactVaultPort,
  ) {}

  async execute(input: RevealContactInput): Promise<Result<{ telefono: string }>> {
    const leadResult = await this.leads.findEnrichedById(input.leadId);
    if (!leadResult.ok) return leadResult;

    const identity = leadResult.value.identidad;
    if (identity === null) {
      return err(new NotFoundError('El lead no tiene contacto disponible'));
    }

    return this.vault.revealForCall(identity.contactoTokenId, input.closerId);
  }
}
