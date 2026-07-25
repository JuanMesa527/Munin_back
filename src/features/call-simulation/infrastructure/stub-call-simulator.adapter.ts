/**
 * Roleplay guionado, sin red. Capa: infrastructure (adapter de `CallSimulatorPort`).
 *
 * Driver por defecto: la demo tiene que poder "llamar" sin `DEEPSEEK_API_KEY` y
 * sin gastar un centavo (mismo espiritu que `StubLlmAdapter` para `LlmPort`).
 * Sigue un guion simple y determinista: plantea las objeciones reales del
 * lead una a una, las da por resueltas en cuanto el closer responde algo, y
 * termina invitando a agendar — suficiente para probar el flujo completo.
 */

import type { CallDifficulty } from '@contracts';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import type { CallSimulatorPort, CallSimulatorTurnResult } from '../application/ports/call-simulator.port.js';

/** Magnitud de los deltas segun dificultad: mas dura = cede menos, castiga mas. */
const AJUSTE_DIFICULTAD: Record<
  CallDifficulty,
  { objecion: number; resolucion: number; entusiasmo: number }
> = {
  receptivo: { objecion: -3, resolucion: 15, entusiasmo: 12 },
  realista: { objecion: -5, resolucion: 12, entusiasmo: 8 },
  dificil: { objecion: -8, resolucion: 8, entusiasmo: 5 },
};

export class StubCallSimulatorAdapter implements CallSimulatorPort {
  openCall(input: Parameters<CallSimulatorPort['openCall']>[0]): Promise<Result<CallSimulatorTurnResult>> {
    return Promise.resolve(
      ok({
        respuesta: `Aló, habla ${input.persona.primerNombre}. ¿Con quién hablo?`,
        mood: 'neutral',
        deltaInteres: 0,
        objecionesPlanteadas: [],
        objecionesResueltas: [],
      }),
    );
  }

  nextTurn(input: Parameters<CallSimulatorPort['nextTurn']>[0]): Promise<Result<CallSimulatorTurnResult>> {
    const ajuste = AJUSTE_DIFICULTAD[input.dificultad];
    const yaPlanteadas = new Set(input.historial.flatMap((turno) => turno.objecionesPlanteadas));
    const yaResueltas = new Set(input.historial.flatMap((turno) => turno.objecionesResueltas));

    const pendienteDeResolver = [...yaPlanteadas].find((pregunta) => !yaResueltas.has(pregunta));
    if (pendienteDeResolver !== undefined) {
      return Promise.resolve(
        ok({
          respuesta: 'Listo, eso me deja más tranquila. ¿Qué más me cuentas?',
          mood: 'interesado',
          deltaInteres: ajuste.resolucion,
          objecionesPlanteadas: [],
          objecionesResueltas: [pendienteDeResolver],
        }),
      );
    }

    const siguienteObjecion = input.persona.objeciones.find(
      (objecion) => !yaPlanteadas.has(objecion.pregunta),
    );
    if (siguienteObjecion !== undefined) {
      return Promise.resolve(
        ok({
          respuesta: siguienteObjecion.pregunta,
          mood: 'frio',
          deltaInteres: ajuste.objecion,
          objecionesPlanteadas: [siguienteObjecion.pregunta],
          objecionesResueltas: [],
        }),
      );
    }

    return Promise.resolve(
      ok({
        respuesta: 'Suena bien, cuéntame cuándo podríamos agendar la visita.',
        mood: 'entusiasta',
        deltaInteres: ajuste.entusiasmo,
        objecionesPlanteadas: [],
        objecionesResueltas: [],
      }),
    );
  }
}
