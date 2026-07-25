/**
 * LLM de mentira, determinista y sin red. Capa: infrastructure (adapter de `LlmPort`).
 *
 * Es el provider por defecto (`LLM_PROVIDER=stub`) para que todo el equipo pueda
 * trabajar y demostrar el flujo sin API key, sin gastar tokens y sin latencia.
 * Tambien es el adapter que usan los tests: un LLM real haria los tests
 * no deterministas, y el corazon del producto (score, capacidad, matching,
 * enrutamiento) tiene que ser reproducible al 100%.
 *
 * Convencion de scaffolding: un parametro con prefijo `_` significa "el cuerpo
 * ignora la entrada a proposito".
 */

import type { Slot } from '@contracts';
import type { LlmPort } from '../../application/ports/llm.port.js';
import type { Result } from '../../kernel/result.js';
import { ok } from '../../kernel/result.js';

/**
 * Textos fijos por intencion. Suenan a explicacion real para que la demo se vea
 * completa, pero NO afirman nada calculado: el "por que" con numeros lo arma la
 * feature con los hechos deterministas.
 */
const EXPLICACIONES: Record<'razon_match' | 'razon_carril' | 'talking_point', string> = {
  razon_match: 'Este proyecto coincide con el perfil declarado del lead.',
  razon_carril: 'La decision se tomo con los datos que el lead ya confirmo.',
  talking_point: 'Confirma con el lead los datos clave antes de avanzar.',
};

export class StubLlmAdapter implements LlmPort {
  /**
   * Devuelve `valor: null` con `confianza: 0` para forzar al caso de uso a caer
   * en su camino sin LLM (quick replies y reglas). Si el flujo se rompe con este
   * adapter, el flujo dependia del modelo para decidir, y eso es exactamente lo
   * que la regla glass-box prohibe.
   */
  extractSlotValue(_input: {
    texto: string;
    slot: Slot;
    contexto: string;
  }): Promise<Result<{ valor: string | null; confianza: number }>> {
    return Promise.resolve(ok({ valor: null, confianza: 0 }));
  }

  writeExplanation(input: {
    hechos: Record<string, string>;
    intencion: 'razon_match' | 'razon_carril' | 'talking_point';
  }): Promise<Result<string>> {
    return Promise.resolve(ok(EXPLICACIONES[input.intencion]));
  }
}
