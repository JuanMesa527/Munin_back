/**
 * Puerto del LLM. Capa: application (puerto compartido).
 *
 * GLASS-BOX (regla 12) — LA RESTRICCION MAS IMPORTANTE DEL PROYECTO:
 * este puerto tiene exactamente dos capacidades y ninguna es decidir.
 *   1. `extractSlotValue`: convertir texto libre del usuario en el valor de un slot.
 *   2. `writeExplanation`: redactar en lenguaje natural un "por que" que YA
 *      calculo una funcion pura y determinista.
 *
 * PROHIBIDO agregar aqui un metodo que puntue, clasifique, ordene, decida
 * viabilidad o elija un proyecto. El score, la capacidad, el matching y el
 * enrutamiento salen de funciones deterministas calibradas contra los 4.142
 * compradores reales: si el jurado pregunta "por que este lead es viable", la
 * respuesta tiene que ser aritmetica auditable, no la opinion de un modelo.
 *
 * La salida del modelo es entrada NO CONFIABLE: el adapter la valida con zod
 * antes de que entre al dominio (OWASP A03).
 */

import type { Slot } from '@contracts';
import type { Result } from '../../kernel/result.js';

export interface LlmPort {
  /**
   * Extrae el valor de UN slot desde texto libre.
   * `confianza` es 0-1 y la usa el caso de uso para decidir si repregunta;
   * el LLM no decide si el dato entra al perfil.
   */
  extractSlotValue(input: {
    texto: string;
    slot: Slot;
    contexto: string;
  }): Promise<Result<{ valor: string | null; confianza: number }>>;

  /**
   * Redacta el "por que" a partir de hechos ya calculados. `hechos` es la
   * evidencia; el modelo solo la pone en prosa y no puede contradecirla.
   */
  writeExplanation(input: {
    hechos: Record<string, string>;
    intencion: 'razon_match' | 'razon_carril' | 'talking_point';
  }): Promise<Result<string>>;
}
