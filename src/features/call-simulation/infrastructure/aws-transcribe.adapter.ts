/**
 * Transcripcion real (Amazon Transcribe Streaming). Capa: infrastructure
 * (adapter de `SpeechTranscriptionPort`).
 *
 * Par natural de `PollySpeechAdapter`: misma cuenta, misma region, misma cadena
 * de credenciales del SDK (perfil del `aws` CLI, variables de entorno o rol de
 * instancia) — NUNCA hardcodeadas. La dependencia esta justificada por la misma
 * razon que Polly: la API exige SigV4 sobre eventos binarios encadenados, no es
 * un `fetch` con un JSON.
 *
 * POR QUE STREAMING PARA UN AUDIO YA COMPLETO: la API batch
 * (`StartTranscriptionJob`) exige subir el audio a S3 y hacer polling de un job
 * asincrono — minutos, y un bucket mas que administrar. La streaming acepta el
 * audio por la misma conexion y responde en ~1-2 s. Se le entrega el buffer ya
 * cerrado troceado en eventos: el push-to-talk no necesita resultados
 * parciales, solo el texto final.
 *
 * No existe `es-CO` en Transcribe: `es-US` es el espanol latinoamericano, el
 * mismo criterio que llevo a `es-MX` en Polly.
 */

import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from '@aws-sdk/client-transcribe-streaming';
import type { TranscriptionResult, UtteranceAudio } from '@contracts';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type { SpeechTranscriptionPort } from '../application/ports/speech-transcription.port.js';

/** ~256 ms de PCM a 16 kHz. AWS pide eventos por debajo de 32 KB. */
const BYTES_POR_EVENTO = 8192;

/** Espanol latinoamericano. Transcribe no tiene `es-CO`. */
const IDIOMA = 'es-US';

/**
 * Corta el buffer en eventos de audio. Es un generador y no un array porque
 * `AudioStream` consume un async iterable: cerrar el generador es lo que le
 * dice a AWS que el habla termino y que emita el resultado final.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- `AudioStream` exige un async iterable; el troceo en si es sincrono
async function* trocear(pcm: Buffer): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
  for (let inicio = 0; inicio < pcm.length; inicio += BYTES_POR_EVENTO) {
    const trozo = pcm.subarray(inicio, Math.min(inicio + BYTES_POR_EVENTO, pcm.length));
    yield { AudioEvent: { AudioChunk: new Uint8Array(trozo) } };
  }
}

export class AwsTranscribeAdapter implements SpeechTranscriptionPort {
  private readonly client: TranscribeStreamingClient;

  constructor(region: string) {
    this.client = new TranscribeStreamingClient({ region });
  }

  async transcribe(audio: UtteranceAudio): Promise<Result<TranscriptionResult>> {
    const pcm = Buffer.from(audio.base64, 'base64');
    if (pcm.length === 0) {
      return err(new DataUnavailableError('No llego audio para transcribir'));
    }

    try {
      const respuesta = await this.client.send(
        new StartStreamTranscriptionCommand({
          LanguageCode: IDIOMA,
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: audio.sampleRate,
          AudioStream: trocear(pcm),
        }),
      );

      const flujo = respuesta.TranscriptResultStream;
      if (flujo === undefined) {
        return err(new DataUnavailableError('Transcribe no devolvio resultados'));
      }

      // Solo se acumulan los resultados NO parciales: los parciales son
      // versiones provisionales del mismo tramo y concatenarlos duplica texto.
      const partes: string[] = [];
      for await (const evento of flujo) {
        for (const resultado of evento.TranscriptEvent?.Transcript?.Results ?? []) {
          if (resultado.IsPartial === true) continue;
          const texto = resultado.Alternatives?.[0]?.Transcript ?? '';
          if (texto.trim().length > 0) partes.push(texto.trim());
        }
      }

      return ok({ texto: partes.join(' ').trim() });
    } catch (causa) {
      // El detalle real va al log del caso de uso, no al cliente (OWASP A09).
      const detalle = causa instanceof Error ? causa.message : 'desconocido';
      return err(new DataUnavailableError(`Transcribe no pudo procesar el audio: ${detalle}`));
    }
  }
}
