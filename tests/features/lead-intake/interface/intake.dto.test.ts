/**
 * Tests de `interface/intake.dto.ts`. Task 2.7. Spec: lead-intake-interface
 * "Zod Validation at Every Endpoint". design.md D6 (threat matrix
 * "client-controlled identifier"): `/consent` nunca acepta `leadId`.
 */

import { describe, expect, it } from 'vitest';
import {
  ProcessConversationTurnRequestSchema,
  StartConversationRequestSchema,
  SubmitConsentRequestSchema,
} from '../../../../src/features/lead-intake/interface/intake.dto.js';

describe('StartConversationRequestSchema', () => {
  it('acepta un body vacio', () => {
    const resultado = StartConversationRequestSchema.safeParse({});
    expect(resultado.success).toBe(true);
  });
});

describe('SubmitConsentRequestSchema', () => {
  it('acepta un consentimiento otorgado valido', () => {
    const resultado = SubmitConsentRequestSchema.safeParse({
      otorgado: true,
      versionPolitica: 'v1',
      finalidades: ['perfilamiento_vivienda'],
      canal: 'web-chat',
    });
    expect(resultado.success).toBe(true);
  });

  it('descarta un leadId inyectado por el cliente en vez de fallar (D6)', () => {
    const resultado = SubmitConsentRequestSchema.safeParse({
      otorgado: true,
      versionPolitica: 'v1',
      finalidades: ['perfilamiento_vivienda'],
      canal: 'web-chat',
      leadId: 'lead-ajeno',
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).not.toHaveProperty('leadId');
    }
  });

  it('rechaza finalidades vacias', () => {
    const resultado = SubmitConsentRequestSchema.safeParse({
      otorgado: true,
      versionPolitica: 'v1',
      finalidades: [],
      canal: 'web-chat',
    });
    expect(resultado.success).toBe(false);
  });

  it('rechaza un valor de finalidad fuera del vocabulario', () => {
    const resultado = SubmitConsentRequestSchema.safeParse({
      otorgado: true,
      versionPolitica: 'v1',
      finalidades: ['algo_inventado'],
      canal: 'web-chat',
    });
    expect(resultado.success).toBe(false);
  });
});

describe('ProcessConversationTurnRequestSchema', () => {
  it('rechaza un body sin leadId', () => {
    const resultado = ProcessConversationTurnRequestSchema.safeParse({
      texto: 'hola',
      quickReplyValue: null,
    });
    expect(resultado.success).toBe(false);
  });

  it('rechaza texto de mas de 500 caracteres (superficie de prompt injection)', () => {
    const resultado = ProcessConversationTurnRequestSchema.safeParse({
      leadId: 'lead-1',
      texto: 'a'.repeat(501),
      quickReplyValue: null,
    });
    expect(resultado.success).toBe(false);
  });

  it('rechaza cuando texto y quickReplyValue son ambos null', () => {
    const resultado = ProcessConversationTurnRequestSchema.safeParse({
      leadId: 'lead-1',
      texto: null,
      quickReplyValue: null,
    });
    expect(resultado.success).toBe(false);
  });

  it('acepta un body valido con solo texto libre', () => {
    const resultado = ProcessConversationTurnRequestSchema.safeParse({
      leadId: 'lead-1',
      texto: 'Sí',
      quickReplyValue: null,
    });
    expect(resultado.success).toBe(true);
  });

  it('acepta un body valido con solo quickReplyValue', () => {
    const resultado = ProcessConversationTurnRequestSchema.safeParse({
      leadId: 'lead-1',
      texto: null,
      quickReplyValue: 'true',
    });
    expect(resultado.success).toBe(true);
  });
});
