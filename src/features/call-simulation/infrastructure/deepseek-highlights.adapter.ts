/**
 * Analista real de la llamada (DeepSeek). Capa: infrastructure
 * (adapter de `CallHighlightsPort`).
 *
 * Mismo patron que `deepseek-call-simulator.adapter.ts`: `fetch` nativo, zod
 * ANTES del dominio, y el mismo `RECORDATORIO_FORMATO` al final de los
 * mensajes — este modelo devuelve contenido en blanco cuando el contexto es
 * largo, y el analisis manda la transcripcion COMPLETA, que es el contexto mas
 * largo de toda la feature.
 *
 * DIFERENCIAS con el simulador:
 *  1. `temperature: 0.2`, no 0.8: analizar no es actuar. Dos analisis de la
 *     misma llamada deberian parecerse.
 *  2. Timeout mas largo (20 s): corre UNA vez al colgar, con el closer mirando
 *     el veredicto, no en medio del dialogo.
 *  3. Si falla, no se reintenta agresivamente: el veredicto ya se puede
 *     mostrar sin esto.
 */

import { z } from 'zod';
import type { CallHighlights } from '@contracts';
import { ValidationError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type {
  CallHighlightsInput,
  CallHighlightsPort,
} from '../application/ports/call-highlights.port.js';
import {
  buildHighlightsPrompt,
  formatearTranscripcion,
  MAXIMO_HIGHLIGHTS,
} from '../domain/highlights-prompt.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

/** Corre una sola vez, al colgar: puede permitirse mas que un turno. */
const TIMEOUT_MS = 20_000;

/** Dos intentos: el modelo se va en blanco y aqui el contexto es el mas largo. */
const MAX_INTENTOS = 2;

const RECORDATORIO_FORMATO =
  '[INSTRUCCION DEL SISTEMA] Responde unicamente con el objeto JSON pedido, sin texto alrededor.';

const HighlightSchema = z.object({
  tipo: z.enum([
    'momento_clave',
    'momento_perdido',
    'acierto',
    'error',
    'objecion_sin_resolver',
    'cumplimiento',
  ]),
  titulo: z.string().trim().min(1).max(120),
  detalle: z.string().trim().min(1).max(500),
  turno: z.number().int().min(0).max(200).nullable(),
  cita: z.string().trim().max(500).nullable(),
  sugerencia: z.string().trim().max(500).nullable(),
});

const HighlightsResponseSchema = z.object({
  resumen: z.string().trim().min(1).max(600),
  items: z.array(HighlightSchema).max(MAXIMO_HIGHLIGHTS),
});

const ChatCompletionEnvelopeSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

/**
 * El modelo cita de memoria y a veces "arregla" la frase. Un highlight con una
 * cita que el closer no dijo destruye la confianza en todo el analisis, asi
 * que la cita se verifica contra la transcripcion real: si no aparece, se
 * conserva el hallazgo pero se le quita la cita inventada.
 *
 * Exportada y pura para poder testearla sin red.
 */
export function descartarCitasInventadas(
  highlights: CallHighlights,
  transcripcion: string,
): CallHighlights {
  const normalizado = transcripcion.toLowerCase();
  return {
    ...highlights,
    items: highlights.items.map((item) => {
      if (item.cita === null) return item;
      const cita = item.cita.trim();
      // Se compara sin puntuacion final, que es lo que el modelo suele alterar.
      const nucleo = cita.replace(/[.,;:!?"'¿¡]/gu, '').toLowerCase();
      const aparece = nucleo.length > 0 && normalizado.replace(/[.,;:!?"'¿¡]/gu, '').includes(nucleo);
      return aparece ? item : { ...item, cita: null };
    }),
  };
}

export class DeepSeekHighlightsAdapter implements CallHighlightsPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async analizar(input: CallHighlightsInput): Promise<Result<CallHighlights>> {
    const transcripcion = formatearTranscripcion(input.turnos);
    const mensajes = [
      { role: 'system' as const, content: buildHighlightsPrompt(input.persona, input.scorecard) },
      { role: 'user' as const, content: `Transcripcion de la llamada:\n${transcripcion}` },
      { role: 'user' as const, content: RECORDATORIO_FORMATO },
    ];

    let ultimo: Result<CallHighlights> = err(
      new ValidationError('No se pudo analizar la llamada'),
    );

    for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
      ultimo = await this.intentar(mensajes);
      if (ultimo.ok) {
        return ok(descartarCitasInventadas(ultimo.value, transcripcion));
      }
    }

    return ultimo;
  }

  private async intentar(
    mensajes: readonly { role: 'system' | 'user'; content: string }[],
  ): Promise<Result<CallHighlights>> {
    let respuesta: Response;
    try {
      respuesta = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: mensajes,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return err(new ValidationError('No se pudo contactar al analista de llamadas'));
    }

    if (!respuesta.ok) {
      return err(
        new ValidationError(`El analista respondio con estado ${String(respuesta.status)}`),
      );
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      return err(new ValidationError('El analista no devolvio JSON'));
    }

    const sobre = ChatCompletionEnvelopeSchema.safeParse(cuerpo);
    if (!sobre.success) {
      return err(new ValidationError('El analista no devolvio el envoltorio esperado'));
    }

    const contenido = sobre.data.choices[0]?.message.content ?? '';
    if (contenido.trim().length === 0) {
      return err(new ValidationError('El analista devolvio una respuesta vacia'));
    }

    let json: unknown;
    try {
      json = JSON.parse(contenido);
    } catch {
      return err(new ValidationError('El analista devolvio un valor que no es JSON valido'));
    }

    const validado = HighlightsResponseSchema.safeParse(json);
    if (!validado.success) {
      return err(new ValidationError('El analisis no tiene el formato esperado'));
    }

    return ok({
      items: validado.data.items,
      resumen: validado.data.resumen,
      generadoPor: this.model,
      // Lo estampa el caso de uso con `ClockPort`; aqui no se inventa el tiempo.
      generadoEn: '',
    });
  }
}
