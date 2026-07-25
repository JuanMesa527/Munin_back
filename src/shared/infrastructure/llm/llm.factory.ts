/**
 * Fabrica del `LlmPort`. Capa: infrastructure.
 * Un solo lugar decide que adapter se usa, para que ninguna feature importe un
 * adapter concreto y el cambio de provider sea una variable de entorno.
 */

import type { LlmPort } from '../../application/ports/llm.port.js';
import type { AppEnv } from '../config/env.js';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter.js';
import { StubLlmAdapter } from './stub-llm.adapter.js';

export function createLlmPort(env: AppEnv): LlmPort {
  if (env.llmProvider === 'anthropic') {
    if (env.anthropicApiKey === null) {
      // `loadEnv` ya valida esto; el chequeo se repite porque un `LlmPort` mal
      // construido falla en el primer turno de chat, delante del jurado.
      throw new Error('LLM_PROVIDER=anthropic exige ANTHROPIC_API_KEY');
    }
    return new AnthropicLlmAdapter({ apiKey: env.anthropicApiKey, model: env.llmModel });
  }

  // Default deliberado: sin llave el proyecto igual corre de punta a punta.
  return new StubLlmAdapter();
}
