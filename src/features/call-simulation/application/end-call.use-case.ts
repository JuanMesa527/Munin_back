/**
 * Caso de uso: cerrar la llamada, calcular el veredicto, analizarlo y
 * archivarlo. Capa: application.
 *
 * GLASS-BOX: el veredicto lo calcula `domain/verdict.ts`, puro y sin LLM ni
 * red — este caso de uso solo recupera la sesion y le pasa la foto final. El
 * analista (`CallHighlightsPort`) corre DESPUES y solo redacta sobre ese
 * veredicto ya cerrado; nunca lo modifica.
 *
 * ORDEN DE PRIORIDADES, de mas a menos importante:
 *  1. Devolverle el veredicto al closer. Es lo unico que no puede fallar.
 *  2. Redactar los highlights. Si el LLM se cae, `highlights: null`.
 *  3. Archivar en Supabase. Si falla, se loguea y ya.
 *
 * Por eso 2 y 3 van en try/catch y sus errores NO se propagan: perder el
 * historico es malo; dejar al closer sin resultado despues de seis minutos
 * hablando es peor.
 */

import type { CallHighlights, CallRecord, CallScorecard, IsoDateTime } from '@contracts';
import type { ClockPort } from '../../../shared/application/ports/clock.port.js';
import { logger } from '../../../shared/infrastructure/logging/logger.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ok } from '../../../shared/kernel/result.js';
import { computeVerdict } from '../domain/verdict.js';
import type { CallHighlightsPort } from './ports/call-highlights.port.js';
import type { AudioParaGuardar, CallRecordingStorePort } from './ports/call-recording.store.js';
import type { CallSessionState, CallSessionStorePort } from './ports/call-session-store.port.js';

export interface EndCallDeps {
  readonly sessions: CallSessionStorePort;
  readonly clock: ClockPort;
  readonly highlights: CallHighlightsPort;
  readonly recordings: CallRecordingStorePort;
}

export interface EndCallInput {
  readonly callId: string;
}

/**
 * Junta el audio de las dos voces: el PCM que dicto el closer y los MP3 que
 * Polly genero para el lead. Se arma aqui, en application, porque cruza dos
 * fuentes de la sesion y ninguna es responsabilidad del store.
 */
function recolectarAudios(sesion: CallSessionState): AudioParaGuardar[] {
  const audios: AudioParaGuardar[] = sesion.audiosCloser.map((audio) => ({
    turno: audio.turnoPrevisto,
    quien: 'closer' as const,
    contenidoBase64: audio.base64,
    contentType: 'audio/pcm' as const,
    sampleRate: audio.sampleRate,
  }));

  for (const turno of sesion.turnos) {
    if (turno.audio === null) continue;
    audios.push({
      turno: turno.indice,
      quien: 'lead',
      contenidoBase64: turno.audio.base64,
      contentType: 'audio/mpeg',
      // El MP3 lleva su frecuencia en la cabecera; no hace falta guardarla.
      sampleRate: null,
    });
  }

  return audios;
}

export class EndCallUseCase {
  constructor(private readonly deps: EndCallDeps) {}

  async execute(input: EndCallInput): Promise<Result<CallScorecard>> {
    const sesion = await this.deps.sessions.end(input.callId);
    if (!sesion.ok) {
      return sesion;
    }

    const terminadaEn = this.deps.clock.now();
    const scorecard = computeVerdict({
      turnos: sesion.value.turnos,
      talkingPoints: sesion.value.persona.talkingPoints,
      objeciones: sesion.value.persona.objeciones,
      dificultad: sesion.value.dificultad,
      iniciadaEn: sesion.value.iniciadaEn,
      terminadaEn,
    });

    const highlights = await this.analizar(sesion.value, scorecard);
    const conHighlights: CallScorecard = { ...scorecard, highlights };

    await this.archivar(sesion.value, conHighlights, terminadaEn);

    return ok(conHighlights);
  }

  /** Nunca lanza: un analisis fallido devuelve `null` y la llamada sigue. */
  private async analizar(
    sesion: CallSessionState,
    scorecard: CallScorecard,
  ): Promise<CallHighlights | null> {
    // Sin intercambios no hay nada que analizar: el closer colgo antes de
    // hablar. Gastar una llamada al LLM para decir eso no aporta.
    if (scorecard.turnos === 0) return null;

    try {
      const resultado = await this.deps.highlights.analizar({
        persona: sesion.persona,
        turnos: sesion.turnos,
        scorecard,
      });
      if (!resultado.ok) {
        logger.warn(
          { callId: sesion.callId, motivo: resultado.error.message },
          'no se pudieron generar los highlights; se devuelve el veredicto sin analisis',
        );
        return null;
      }
      // El adapter no inventa la hora: la estampa el reloj inyectado.
      return { ...resultado.value, generadoEn: this.deps.clock.now() };
    } catch (causa) {
      logger.error({ callId: sesion.callId, err: causa }, 'el analista de llamadas lanzo');
      return null;
    }
  }

  /** Nunca lanza: el archivo es historico, no parte de la respuesta. */
  private async archivar(
    sesion: CallSessionState,
    scorecard: CallScorecard,
    terminadaEn: IsoDateTime,
  ): Promise<void> {
    try {
      const grabaciones = await this.deps.recordings.subirAudios(
        sesion.callId,
        recolectarAudios(sesion),
      );

      const registro: CallRecord = {
        callId: sesion.callId,
        leadId: sesion.leadId,
        dificultad: sesion.dificultad,
        transcripcion: sesion.turnos,
        scorecard,
        highlights: scorecard.highlights,
        grabaciones,
        iniciadaEn: sesion.iniciadaEn,
        terminadaEn,
      };

      await this.deps.recordings.guardar(registro);
    } catch (causa) {
      logger.error({ callId: sesion.callId, err: causa }, 'no se pudo archivar la llamada');
    }
  }
}
