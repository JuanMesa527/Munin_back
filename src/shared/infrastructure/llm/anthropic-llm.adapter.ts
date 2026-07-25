/**
 * LLM real (Anthropic). Capa: infrastructure (adapter de `LlmPort`).
 *
 * REGLAS DE IMPLEMENTACION — no negociables, son el corazon del glass-box:
 *
 *  1. El prompt SOLO puede pedir dos cosas: extraer el valor de un slot desde
 *     texto libre, o redactar en prosa hechos que YA vienen calculados. Jamas
 *     "decide si este lead es viable", "asignale un puntaje", "elige el mejor
 *     proyecto" ni "ordena estos leads". Esa clase de pregunta hace la decision
 *     inexplicable ante el jurado y ante el titular del dato.
 *  2. La respuesta del modelo es ENTRADA NO CONFIABLE: se valida con zod contra
 *     un schema estrecho ANTES de entrar al dominio, y si no valida se devuelve
 *     un `Result` de error, nunca un valor "aproximado" (OWASP A03).
 *  3. El texto del usuario va como DATO, delimitado y acotado en largo (el DTO
 *     ya lo corta en 500 chars), nunca concatenado dentro de las instrucciones:
 *     asi una inyeccion de prompt no puede reescribir la tarea.
 *  4. Nada de PII en el prompt mas alla del texto que el usuario acaba de
 *     escribir: no se envian telefonos, ni el nombre completo, ni el id del lead.
 *  5. La llave vive en `env.anthropicApiKey` y no se loguea nunca (el logger
 *     redacta `*.ANTHROPIC_API_KEY` como segunda barrera).
 *
 * El cliente `@anthropic-ai/sdk` se instancia aqui cuando se implemente; todavia
 * no se importa para no dejar dependencias muertas en el arranque.
 */

import type { Slot } from '@contracts';
import type { LlmPort } from '../../application/ports/llm.port.js';
import type { Result } from '../../kernel/result.js';

export interface AnthropicLlmAdapterConfig {
  readonly apiKey: string;
  readonly model: string;
}

export class AnthropicLlmAdapter implements LlmPort {
  constructor(private readonly config: AnthropicLlmAdapterConfig) {}

  /**
   * TODO(F1): llamar al modelo con un prompt de EXTRACCION y validar la salida
   * con zod (`{ valor: string | null, confianza: number }`, `confianza` en 0-1).
   * Con `confianza` baja, el caso de uso repregunta: el modelo no completa datos
   * que el lead no dijo.
   */
  extractSlotValue(_input: {
    texto: string;
    slot: Slot;
    contexto: string;
  }): Promise<Result<{ valor: string | null; confianza: number }>> {
    throw new Error(`TODO: not implemented (modelo ${this.config.model})`);
  }

  /**
   * TODO(F1/F4): redactar el "por que" a partir de `hechos`. El prompt debe
   * prohibir explicitamente inventar cifras y exigir usar solo los hechos dados.
   */
  writeExplanation(_input: {
    hechos: Record<string, string>;
    intencion: 'razon_match' | 'razon_carril' | 'talking_point';
  }): Promise<Result<string>> {
    throw new Error(`TODO: not implemented (modelo ${this.config.model})`);
  }
}
