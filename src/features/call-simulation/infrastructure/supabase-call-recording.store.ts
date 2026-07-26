/**
 * Archivo historico de llamadas en Supabase. Capa: infrastructure (adapter de
 * `CallRecordingStorePort`)..
 *
 * Dos destinos:
 *  - tabla `call_sessions`: la fila con transcripcion, veredicto y highlights;
 *  - bucket privado `call-recordings`: el audio.
 *
 * TODO best-effort: ningun fallo aqui puede tumbar el veredicto. Los errores se
 * loguean y se devuelven como `Result`, y `EndCallUseCase` los ignora a
 * proposito. Perder el historico de una llamada es malo; dejar al closer sin su
 * resultado despues de seis minutos hablando es peor.
 */

import type { CallRecord, CallRecordingRef } from '@contracts';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import { logger } from '../../../shared/infrastructure/logging/logger.js';
import type { AppSupabaseClient } from '../../../shared/infrastructure/persistence/supabase/supabase-client.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type {
  AudioParaGuardar,
  CallRecordingStorePort,
} from '../application/ports/call-recording.store.js';

const BUCKET = 'call-recordings';

/** `audio/pcm` no tiene extension estandar; `.pcm` es lo que todos usan. */
const EXTENSION: Record<AudioParaGuardar['contentType'], string> = {
  'audio/pcm': 'pcm',
  'audio/mpeg': 'mp3',
};

export class SupabaseCallRecordingStore implements CallRecordingStorePort {
  constructor(private readonly client: AppSupabaseClient) {}

  async subirAudios(
    callId: string,
    audios: readonly AudioParaGuardar[],
  ): Promise<CallRecordingRef[]> {
    const refs: CallRecordingRef[] = [];

    for (const audio of audios) {
      const path = `${callId}/${audio.quien}-${String(audio.turno)}.${EXTENSION[audio.contentType]}`;
      // `Buffer.from` sobre base64 y no un Blob: en Node el SDK acepta el
      // buffer directo y evita una copia mas del audio en memoria.
      const binario = Buffer.from(audio.contenidoBase64, 'base64');

      const { error } = await this.client.storage
        .from(BUCKET)
        .upload(path, binario, { contentType: audio.contentType, upsert: true });

      if (error) {
        // Un audio perdido no invalida el resto: se omite del array y la
        // transcripcion (que es la fuente de verdad) queda igual de completa.
        logger.warn({ callId, path, err: error.message }, 'no se pudo subir un audio de la llamada');
        continue;
      }

      refs.push({
        turno: audio.turno,
        quien: audio.quien,
        path,
        contentType: audio.contentType,
        sampleRate: audio.sampleRate,
      });
    }

    return refs;
  }

  async guardar(registro: CallRecord): Promise<Result<void>> {
    const { error } = await this.client.from('call_sessions').upsert({
      id: registro.callId,
      lead_id: registro.leadId,
      dificultad: registro.dificultad,
      outcome: registro.scorecard.outcome,
      puntaje: registro.scorecard.puntaje,
      interes_final: registro.scorecard.interesFinal,
      turnos: registro.scorecard.turnos,
      duracion_segundos: registro.scorecard.duracionSegundos,
      // El audio NO se embebe en la transcripcion: son megas de base64 dentro
      // de un jsonb que despues nadie puede consultar. Van al bucket y aqui
      // queda el puntero en `grabaciones`.
      transcripcion: registro.transcripcion.map((turno) => ({ ...turno, audio: null })),
      scorecard: registro.scorecard,
      highlights: registro.highlights,
      grabaciones: registro.grabaciones,
      iniciada_en: registro.iniciadaEn,
      terminada_en: registro.terminadaEn,
    });

    if (error) {
      logger.error({ callId: registro.callId, err: error.message }, 'no se pudo archivar la llamada');
      return err(new DataUnavailableError('No se pudo archivar la llamada'));
    }

    logger.info(
      { callId: registro.callId, audios: registro.grabaciones.length },
      'llamada archivada',
    );
    return ok(undefined);
  }
}
