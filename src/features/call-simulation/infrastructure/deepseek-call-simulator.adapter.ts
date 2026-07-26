/**
 * Roleplay real (DeepSeek). Capa: infrastructure (adapter de
 * `CallSimulatorPort`).
 *
 * Mismo patron que `shared/infrastructure/llm/deepseek-llm.adapter.ts`: `fetch`
 * nativo (Node 22, — no meter el SDK `openai` por una llamada POST), salida
 * validada con zod ANTES de entrar al dominio, texto del closer SIEMPRE
 * delimitado como mensaje `user`, nunca concatenado en el `system`.
 *
 * DIFERENCIAS deliberadas frente a `deepseek-llm.adapter.ts`:
 *  1. `temperature: 0.8` (no 0): el roleplay necesita variacion humana; la
 *     extraccion de slots de F1 necesita el mismo output siempre.
 *  2. La respuesta se acota a ~320 chars, no 400: hay que sonar bien por
 *     telefono via Polly, y una replica larga tarda mas en sintetizarse.
 *  3. El "system prompt" no vive aqui: lo arma `domain/persona.ts#buildSystemPrompt`,
 *     puro y testeado sin red (protege la garantia "el prompt nunca lleva PII").
 *
 * GLASS-BOX: este adapter interpreta a la persona, nunca decide `CallOutcome`
 * ni `puntaje` — eso es `domain/verdict.ts`.
 */

import { z } from 'zod';
import type { CallDifficulty, CallTurn, PersonaContext } from '@contracts';
import { ValidationError } from '../../../shared/kernel/errors.js';
import { logger } from '../../../shared/infrastructure/logging/logger.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type {
  CallSimulatorPort,
  CallSimulatorTurnResult,
} from '../application/ports/call-simulator.port.js';
import { buildSystemPrompt, resumirEstado } from '../domain/persona.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

/** Un turno no puede quedar colgado esperando al modelo (mismo limite que F1). */
const TIMEOUT_MS = 8_000;

/**
 * Red de seguridad detras de `RECORDATORIO_FORMATO`, que es la cura de verdad
 * para el turno en blanco. Se mantiene el reintento porque un pico de red o un
 * 5xx siguen existiendo, y porque una regresion del proveedor no deberia
 * volver la llamada inusable de un dia para otro.
 *
 * OJO: reintentar el MISMO request no basta para el turno vacio — el fallo
 * esta correlacionado con el contexto, no es ruido independiente (medido: con
 * solo reintentos seguian cayendo 2 de 8 turnos). Por eso el arreglo real es
 * el recordatorio, no este contador.
 */
const MAX_INTENTOS = 3;

/**
 * Techo de tiempo para TODOS los intentos juntos. Sin el, tres timeouts
 * seguidos dejarian al closer 24 s mirando la pantalla; mas vale decirle que
 * reintente que fingir que la llamada sigue viva.
 */
const PRESUPUESTO_TOTAL_MS = 15_000;

/** Replica corta: suena natural por telefono y sintetiza rapido en Polly. */
const LARGO_MAXIMO_RESPUESTA = 320;
const MAXIMO_OBJECIONES_POR_TURNO = 5;

const TurnResponseSchema = z.object({
  respuesta: z.string().trim().min(1).max(LARGO_MAXIMO_RESPUESTA),
  mood: z.enum(['frio', 'neutral', 'interesado', 'entusiasta', 'molesto']),
  deltaInteres: z.number().min(-20).max(20),
  objecionesPlanteadas: z.array(z.string().trim().max(300)).max(MAXIMO_OBJECIONES_POR_TURNO),
  objecionesResueltas: z.array(z.string().trim().max(300)).max(MAXIMO_OBJECIONES_POR_TURNO),
});

/** Envoltorio OpenAI-compatible de DeepSeek: solo lo que realmente leemos. */
const ChatCompletionEnvelopeSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
});

const APERTURA_INSTRUCCION =
  '[INSTRUCCION DEL SISTEMA, no del closer] El telefono acaba de sonar y estas respondiendo la ' +
  'llamada. Responde con tu saludo inicial, en el formato JSON pedido.';

/**
 * Ultimo mensaje de CADA request. No es cosmetico: sin el, `deepseek-v4-flash`
 * devuelve el contenido en blanco el 70% de las veces cuando el historial ya
 * tiene varios turnos (medido, 7 de 10) — el modelo razona y no emite nada,
 * con `finish_reason: "stop"`. Con el recordatorio: 0 de 12 en ese mismo
 * historial, y 0 de 6 con historial corto, sin degradar el roleplay.
 *
 * Va como mensaje aparte y no dentro del system prompt a proposito: el system
 * prompt es dominio puro y testeado (`domain/persona.ts`), y esto es una
 * curita para una rareza de ESTE proveedor. Si se cambia de modelo, se borra
 * aqui y el dominio no se entera.
 *
 * `[INSTRUCCION DEL SISTEMA...]` mantiene la disciplina anti-inyeccion: el
 * modelo sabe que esto no lo dijo el closer.
 */
const RECORDATORIO_FORMATO =
  '[INSTRUCCION DEL SISTEMA, no del closer] Responde unicamente con el objeto JSON pedido, ' +
  'en una sola linea, sin texto alrededor.';

interface Mensaje {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * `JSON.parse` sobre texto NO confiable: nunca deja escapar un `SyntaxError`
 * crudo hacia el caso de uso.
 */
function parseJson(texto: string): Result<unknown> {
  try {
    const valor: unknown = JSON.parse(texto);
    return ok(valor);
  } catch {
    return err(new ValidationError('DeepSeek devolvio un valor que no es JSON valido'));
  }
}

/**
 * Valida el contenido de un turno. Exportada y PURA a proposito: es la pieza
 * que se testea con JSON de muestra, sin tocar la red (`config.yaml`
 * `integration: false`), igual que `parseExtractSlotValueContent` en F1.
 */
export function parseTurnResponseContent(content: string): Result<CallSimulatorTurnResult> {
  const json = parseJson(content);
  if (!json.ok) {
    return json;
  }

  const validado = TurnResponseSchema.safeParse(json.value);
  if (!validado.success) {
    return err(
      new ValidationError('La respuesta de DeepSeek no tiene el formato de turno esperado'),
    );
  }

  return ok(validado.data);
}

async function parseHttpJson(respuesta: Response): Promise<Result<unknown>> {
  try {
    const valor: unknown = await respuesta.json();
    return ok(valor);
  } catch {
    return err(new ValidationError('La respuesta del proveedor de LLM no es JSON valido'));
  }
}

/**
 * Resultado de UN intento + si vale la pena repetirlo. Se modela explicito en
 * vez de inferirlo del mensaje de error: adivinar por texto es fragil y quien
 * agregue un error nuevo tiene que decidir a proposito si se reintenta.
 */
interface IntentoTurno {
  readonly resultado: Result<CallSimulatorTurnResult>;
  readonly reintentable: boolean;
}

function reintentable(error: ValidationError): IntentoTurno {
  return { resultado: err(error), reintentable: true };
}

function definitivo(resultado: Result<CallSimulatorTurnResult> | ValidationError): IntentoTurno {
  return {
    resultado: resultado instanceof ValidationError ? err(resultado) : resultado,
    reintentable: false,
  };
}

export class DeepSeekCallSimulatorAdapter implements CallSimulatorPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async openCall(input: {
    persona: PersonaContext;
    dificultad: CallDifficulty;
  }): Promise<Result<CallSimulatorTurnResult>> {
    const mensajes: Mensaje[] = [
      { role: 'system', content: buildSystemPrompt(input.persona, input.dificultad) },
      { role: 'user', content: APERTURA_INSTRUCCION },
    ];
    return this.solicitar(mensajes);
  }

  async nextTurn(input: {
    persona: PersonaContext;
    dificultad: CallDifficulty;
    historial: readonly CallTurn[];
    closerDijo: string;
  }): Promise<Result<CallSimulatorTurnResult>> {
    // El estado (interes acumulado + objeciones ya resueltas) se recalcula en
    // cada turno: es lo que evita que el lead se contradiga y de vueltas.
    const mensajes: Mensaje[] = [
      {
        role: 'system',
        content: buildSystemPrompt(input.persona, input.dificultad, resumirEstado(input.historial)),
      },
    ];

    for (const turno of input.historial) {
      // El turno de apertura (indice 0) no tiene `closerDijo`: el closer aun
      // no habia dicho nada cuando el lead contesto el telefono.
      if (turno.indice > 0) {
        mensajes.push({ role: 'user', content: turno.closerDijo });
      }
      mensajes.push({ role: 'assistant', content: turno.leadRespondio });
    }

    // Dato delimitado, nunca concatenado en la instruccion.
    mensajes.push({ role: 'user', content: input.closerDijo });

    return this.solicitar(mensajes);
  }

  /**
   * Reintenta mientras el fallo sea varianza del modelo (contenido vacio o
   * fuera de schema) y quede presupuesto. Un 401 o un prompt mal formado no se
   * reintentan: repetirlos solo suma latencia al mismo error.
   */
  private async solicitar(mensajes: readonly Mensaje[]): Promise<Result<CallSimulatorTurnResult>> {
    const limite = Date.now() + PRESUPUESTO_TOTAL_MS;
    let ultimo = await this.intentarUnaVez(mensajes);

    for (let intento = 2; intento <= MAX_INTENTOS; intento += 1) {
      if (ultimo.resultado.ok || !ultimo.reintentable || Date.now() >= limite) break;
      logger.warn(
        { intento, motivo: ultimo.resultado.error.message },
        'DeepSeek devolvio un turno inservible; reintentando',
      );
      ultimo = await this.intentarUnaVez(mensajes);
    }

    return ultimo.resultado;
  }

  /**
   * Unico punto que hace I/O real. A proposito delgado: toda la logica que
   * vale la pena testear vive en `parseTurnResponseContent`.
   */
  private async intentarUnaVez(mensajes: readonly Mensaje[]): Promise<IntentoTurno> {
    let respuestaHttp: Response;
    try {
      respuestaHttp = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.8,
          response_format: { type: 'json_object' },
          // El recordatorio va SIEMPRE al final, tanto en la apertura como en
          // cada turno: es donde el modelo lo obedece.
          messages: [...mensajes, { role: 'user', content: RECORDATORIO_FORMATO }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Red caida, DNS o timeout: el turno se degrada a error tipado, nunca
      // truena delante del jurado (misma disciplina que D11 en F1). Un timeout
      // si merece otro intento: suele ser un pico, no el servicio caido.
      return reintentable(new ValidationError('No se pudo contactar al proveedor de LLM'));
    }

    if (!respuestaHttp.ok) {
      const fallo = new ValidationError(
        `El proveedor de LLM respondio con estado ${String(respuestaHttp.status)}`,
      );
      // 5xx y 429 son transitorios; un 401 (llave mala) o un 400 (request mal
      // armado) van a fallar igual las tres veces.
      const transitorio = respuestaHttp.status >= 500 || respuestaHttp.status === 429;
      return transitorio ? reintentable(fallo) : definitivo(fallo);
    }

    const cuerpo = await parseHttpJson(respuestaHttp);
    if (!cuerpo.ok) {
      return reintentable(cuerpo.error);
    }

    const sobre = ChatCompletionEnvelopeSchema.safeParse(cuerpo.value);
    if (!sobre.success) {
      return reintentable(
        new ValidationError('La respuesta del proveedor de LLM no tiene el formato esperado'),
      );
    }

    const primero = sobre.data.choices[0];
    if (primero === undefined) {
      return reintentable(
        new ValidationError('La respuesta del proveedor de LLM no trajo choices'),
      );
    }

    // El caso que motivo todo esto: contenido en blanco. Se nombra aparte del
    // "no es JSON valido" generico para que el log diga que paso de verdad.
    if (primero.message.content.trim().length === 0) {
      return reintentable(new ValidationError('DeepSeek devolvio un turno vacio'));
    }

    const contenido = parseTurnResponseContent(primero.message.content);
    return contenido.ok ? definitivo(contenido) : reintentable(contenido.error);
  }
}
