/**
 * Tests de `deepseek-llm.adapter.ts`. Capa: infrastructure.
 * `config.yaml` marca `integration: false`: nunca se llama al DeepSeek real.
 * Los primeros dos `describe` cubren las funciones puras de parseo/validacion
 * (design.md D11); el tercero mockea `global.fetch` para cubrir non-2xx,
 * timeout y JSON malformado sin tocar la red (tasks.md 5.5).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DeepSeekLlmAdapter,
  parseConverseIntakeContent,
  parseExtractSlotValueContent,
  parseWriteExplanationContent,
} from '../../../../src/shared/infrastructure/llm/deepseek-llm.adapter.js';

function chatCompletionBody(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

describe('parseExtractSlotValueContent', () => {
  it('acepta JSON valido con la forma { valor, confianza }', () => {
    const resultado = parseExtractSlotValueContent(
      JSON.stringify({ valor: 'Bogota', confianza: 0.9 }),
    );
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ valor: 'Bogota', confianza: 0.9 });
    }
  });

  it('acepta valor: null con confianza 0 (el modelo no pudo extraer nada)', () => {
    const resultado = parseExtractSlotValueContent(JSON.stringify({ valor: null, confianza: 0 }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ valor: null, confianza: 0 });
    }
  });

  it('rechaza texto que no es JSON', () => {
    const resultado = parseExtractSlotValueContent('esto no es json');
    expect(resultado.ok).toBe(false);
  });

  it('rechaza confianza fuera de rango (> 1)', () => {
    const resultado = parseExtractSlotValueContent(JSON.stringify({ valor: 'x', confianza: 1.5 }));
    expect(resultado.ok).toBe(false);
  });

  it('rechaza confianza fuera de rango (< 0)', () => {
    const resultado = parseExtractSlotValueContent(JSON.stringify({ valor: 'x', confianza: -0.1 }));
    expect(resultado.ok).toBe(false);
  });

  it('rechaza un JSON valido que no tiene la forma esperada (campos faltantes)', () => {
    const resultado = parseExtractSlotValueContent(JSON.stringify({ otraCosa: 1 }));
    expect(resultado.ok).toBe(false);
  });

  it('rechaza valor mas largo que el limite de 120 caracteres', () => {
    const resultado = parseExtractSlotValueContent(
      JSON.stringify({ valor: 'a'.repeat(121), confianza: 0.5 }),
    );
    expect(resultado.ok).toBe(false);
  });

  it('normaliza a string un valor boolean (comportamiento real verificado contra la API de DeepSeek: para slots si/no el modelo devuelve el tipo JSON nativo, no la cadena "true")', () => {
    const resultado = parseExtractSlotValueContent(JSON.stringify({ valor: true, confianza: 1 }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ valor: 'true', confianza: 1 });
    }
  });

  it('normaliza a string un valor numerico', () => {
    const resultado = parseExtractSlotValueContent(JSON.stringify({ valor: 3, confianza: 0.8 }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ valor: '3', confianza: 0.8 });
    }
  });
});

describe('parseWriteExplanationContent', () => {
  it('acepta un texto no vacio dentro del limite', () => {
    const resultado = parseWriteExplanationContent('El lead cumple los criterios estimados.');
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toBe('El lead cumple los criterios estimados.');
    }
  });

  it('recorta espacios en blanco de los bordes', () => {
    const resultado = parseWriteExplanationContent('  texto con espacios  ');
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toBe('texto con espacios');
    }
  });

  it('rechaza texto vacio o solo espacios', () => {
    const resultado = parseWriteExplanationContent('   ');
    expect(resultado.ok).toBe(false);
  });

  it('rechaza texto mas largo que 400 caracteres', () => {
    const resultado = parseWriteExplanationContent('a'.repeat(401));
    expect(resultado.ok).toBe(false);
  });
});

describe('parseConverseIntakeContent', () => {
  const pendientes = ['afiliacion', 'ciudad', 'rangoSalarial'] as const;

  it('acepta extracciones de slots pendientes y la respuesta del bot', () => {
    const resultado = parseConverseIntakeContent(
      JSON.stringify({
        extracciones: [
          { slot: 'afiliacion', valor: true, confianza: 0.9 },
          { slot: 'ciudad', valor: 'Bogotá', confianza: 0.8 },
        ],
        respuestaBot: 'Perfecto. ¿En qué rango están tus ingresos?',
      }),
      pendientes,
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.extracciones).toEqual([
      { slot: 'afiliacion', valor: 'true', confianza: 0.9 },
      { slot: 'ciudad', valor: 'Bogotá', confianza: 0.8 },
    ]);
    expect(resultado.value.respuestaBot).toMatch(/ingresos/i);
  });

  it('descarta slots inventados fuera de slotsPermitidos', () => {
    const resultado = parseConverseIntakeContent(
      JSON.stringify({
        extracciones: [
          { slot: 'afiliacion', valor: 'true', confianza: 1 },
          { slot: 'carril', valor: 'viable', confianza: 1 },
          { slot: 'ahorro', valor: '1000000', confianza: 1 },
        ],
        respuestaBot: 'Seguimos.',
      }),
      pendientes,
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.extracciones).toEqual([
      { slot: 'afiliacion', valor: 'true', confianza: 1 },
    ]);
  });

  it('rechaza JSON invalido o sin respuestaBot', () => {
    expect(parseConverseIntakeContent('no-json', pendientes).ok).toBe(false);
    expect(
      parseConverseIntakeContent(JSON.stringify({ extracciones: [] }), pendientes).ok,
    ).toBe(false);
  });
});

describe('DeepSeekLlmAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extractSlotValue devuelve ok cuando DeepSeek responde 200 con JSON valido', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(chatCompletionBody(JSON.stringify({ valor: 'Bogota', confianza: 0.8 })), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    const resultado = await adapter.extractSlotValue({
      texto: 'Vivo en Bogota',
      slot: 'ciudad',
      contexto: 'pregunta por ciudad',
    });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toEqual({ valor: 'Bogota', confianza: 0.8 });
    }
    // La llave nunca viaja como texto plano en ningun otro lado del request.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-key');
  });

  it('extractSlotValue devuelve err cuando DeepSeek responde con estado no-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error interno', { status: 500 })),
    );

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    const resultado = await adapter.extractSlotValue({
      texto: 'texto libre',
      slot: 'ciudad',
      contexto: 'ctx',
    });

    expect(resultado.ok).toBe(false);
  });

  it('extractSlotValue devuelve err cuando el body no es JSON valido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('no-es-json{{{', { status: 200 })),
    );

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    const resultado = await adapter.extractSlotValue({
      texto: 'texto libre',
      slot: 'ciudad',
      contexto: 'ctx',
    });

    expect(resultado.ok).toBe(false);
  });

  it('extractSlotValue devuelve err cuando fetch revienta (red caida o timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError')),
    );

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    const resultado = await adapter.extractSlotValue({
      texto: 'texto libre',
      slot: 'ciudad',
      contexto: 'ctx',
    });

    expect(resultado.ok).toBe(false);
  });

  it('writeExplanation devuelve ok con la prosa redactada por el modelo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          chatCompletionBody('El lead cumple los criterios estimados para este proyecto.'),
          {
            status: 200,
          },
        ),
      ),
    );

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    const resultado = await adapter.writeExplanation({
      hechos: { afiliado: 'si' },
      intencion: 'razon_carril',
    });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value).toBe('El lead cumple los criterios estimados para este proyecto.');
    }
  });

  it('writeExplanation devuelve err cuando DeepSeek responde con estado no-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 503 })));

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    const resultado = await adapter.writeExplanation({
      hechos: { afiliado: 'si' },
      intencion: 'razon_match',
    });

    expect(resultado.ok).toBe(false);
  });

  it('converseIntake envia AMBOS anclajes (pregunta actual y siguiente probable) condicionados en el system prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        chatCompletionBody(
          JSON.stringify({
            extracciones: [{ slot: 'email', valor: 'ana@example.com', confianza: 0.95 }],
            respuestaBot: 'Gracias, he registrado tu correo electrónico. ¿A qué número te contactamos?',
          }),
        ),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    await adapter.converseIntake({
      texto: 'mi correo es ana@example.com',
      slotsPendientes: ['email', 'telefono'],
      perfilParcial: {},
      vocabulario: {},
      preguntaAnclada: '¿Cuál es tu correo electrónico?',
      preguntaSiguienteProbable: '¿A qué número de celular te podemos contactar?',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: { role: string; content: string }[];
    };
    const systemPrompt = body.messages.find((m) => m.role === 'system')?.content ?? '';

    expect(systemPrompt).toContain('¿Cuál es tu correo electrónico?');
    expect(systemPrompt).toContain('¿A qué número de celular te podemos contactar?');
  });

  it('converseIntake, cuando preguntaSiguienteProbable es null, instruye a no cerrar con otra pregunta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        chatCompletionBody(
          JSON.stringify({ extracciones: [], respuestaBot: 'Perfecto, ya tengo todo lo que necesitaba.' }),
        ),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DeepSeekLlmAdapter('test-key', 'deepseek-chat');
    await adapter.converseIntake({
      texto: 'lo antes posible',
      slotsPendientes: ['horizonteCompra'],
      perfilParcial: {},
      vocabulario: {},
      preguntaAnclada: '¿Para cuándo estás buscando tu vivienda?',
      preguntaSiguienteProbable: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: { role: string; content: string }[];
    };
    const systemPrompt = body.messages.find((m) => m.role === 'system')?.content ?? '';

    expect(systemPrompt).toContain('no hagas ninguna pregunta de cierre');
  });
});
