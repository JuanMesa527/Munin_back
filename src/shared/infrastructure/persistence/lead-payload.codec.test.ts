import { describe, expect, it } from 'vitest';
import { leadProfile } from './lead-repository.contract.js';
import { LeadProfilePayloadSchema } from './lead-payload.codec.js';

describe('LeadProfilePayloadSchema', () => {
  it('conserva la identidad tokenizada capturada por F1', () => {
    const profile = {
      ...leadProfile('lead-con-identidad'),
      identidad: {
        nombre: 'ContactoFicticio',
        telefonoEnmascarado: '+57 3.. ... ..42',
        contactoTokenId: 'token-ficticio',
      },
    };

    expect(LeadProfilePayloadSchema.parse(profile).identidad).toEqual(profile.identidad);
  });
});
