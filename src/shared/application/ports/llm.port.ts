/**
 * Puerto del LLM. Capa: application (puerto compartido).
 *
 * GLASS-BOX — LA RESTRICCION MAS IMPORTANTE DEL PROYECTO: este puerto NO decide
 * score, capacidad, matching ni carril. Capacidades permitidas:
 *   1. `extractSlotValue`: convertir texto libre en el valor de UN slot.
 *   2. `converseIntake`: extraer CERO O MAS slots pendientes + redactar la
 *      siguiente pregunta en prosa (intake conversacional).
 *   3. `writeExplanation`: redactar un "por que" que YA calculo una funcion
 *      pura y determinista.
 *
 * PROHIBIDO agregar un metodo que puntue, clasifique, ordene, decida viabilidad
 * o elija un proyecto.
 *
 * La salida del modelo es entrada NO CONFIABLE: el adapter la valida con zod
 * antes de que entre al dominio (OWASP A03).
 */

import type { Slot } from '@contracts';
import type { Result } from '../../kernel/result.js';

/** Extraccion candidata de un slot; el caso de uso la revalida con `parseAnswer`. */
export interface ConverseIntakeExtraction {
  readonly slot: Slot;
  readonly valor: string;
  readonly confianza: number;
}

export interface ConverseIntakeResult {
  readonly extracciones: readonly ConverseIntakeExtraction[];
  readonly respuestaBot: string;
}

export interface ConverseIntakeInput {
  readonly texto: string;
  /** Solo estos slots pueden aparecer en `extracciones`. */
  readonly slotsPendientes: readonly Slot[];
  /** Valores ya capturados (sin PII extra): contexto para no repreguntar. */
  readonly perfilParcial: Record<string, string>;
  /** Vocabulario cerrado por slot pendiente (chips), cuando aplica. */
  readonly vocabulario: Record<string, readonly string[]>;
  /**
   * Copy determinista (`stepPromptFor`) del slot ACTUAL (el que el usuario
   * esta respondiendo en este turno) segun `ASKED_SLOTS`. Es el ancla para el
   * camino de FALLO: si el modelo no logra extraer nada relevante, su
   * `respuestaBot` tiene que terminar preguntando ESTO — nunca combinar otro
   * slot ni inventar una pregunta distinta. Sin esta ancla el modelo ve
   * `slotsPendientes` como una bolsa sin orden y redacta preguntas que no
   * coinciden con los quickReplies reales que la UI muestra (los quickReplies
   * SI siguen el orden fijo).
   */
  readonly preguntaAnclada: string;
  /**
   * Copy determinista del slot que pasaria a ser "actual" SI el modelo logra
   * extraer con confianza el valor del slot de `preguntaAnclada` en este mismo
   * mensaje (`pendientes[1]` en `procesarTextoLibre`). `null` cuando no queda
   * ningun slot pendiente despues de este (el perfilamiento terminaria).
   *
   * Ancla del camino de EXITO, complementaria a `preguntaAnclada`: sin este
   * segundo ancla el modelo, siguiendo la instruccion de `preguntaAnclada` al
   * pie de la letra, termina preguntando de nuevo por el slot que EL MISMO
   * acaba de extraer con exito — el bug de "confirma y repregunta lo mismo".
   */
  readonly preguntaSiguienteProbable: string | null;
}

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
   * Turno conversacional de F1: puede llenar varios slots pendientes a la vez
   * y redacta la respuesta del bot. Nunca puntua ni decide carril.
   */
  converseIntake(input: ConverseIntakeInput): Promise<Result<ConverseIntakeResult>>;

  /**
   * Redacta el "por que" a partir de hechos ya calculados. `hechos` es la
   * evidencia; el modelo solo la pone en prosa y no puede contradecirla.
   */
  writeExplanation(input: {
    hechos: Record<string, string>;
    intencion: 'razon_match' | 'razon_carril' | 'talking_point';
  }): Promise<Result<string>>;
}
