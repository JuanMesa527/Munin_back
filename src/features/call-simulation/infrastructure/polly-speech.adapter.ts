/**
 * Voz real (Amazon Polly). Capa: infrastructure (adapter de
 * `SpeechSynthesisPort`).
 *
 * `@aws-sdk/client-polly` es una dependencia justificada (a diferencia de por
 * que DeepSeek va sobre `fetch`): Polly exige firmar cada request con SigV4
 * (HMAC-SHA256 sobre un request canonico), ~150 lineas para implementar
 * correctamente a mano — justo la clase de complejidad que la no busca evitar.
 * Las credenciales usan la cadena por defecto del SDK (perfil del `aws` CLI,
 * variables de entorno o rol de instancia): NUNCA hardcodeadas aqui.
 *
 * No existe voz `es-CO`: se usa `es-MX` (Mia/Andres por defecto), el acento
 * neutro latino mas cercano disponible en Polly.
 */

import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import type { VoiceId } from '@aws-sdk/client-polly';
import type { CallTurnAudio, SimulatedVoice } from '@contracts';
import type { PollyEngine } from '../../../shared/infrastructure/config/env.js';
import { DataUnavailableError } from '../../../shared/kernel/errors.js';
import type { Result } from '../../../shared/kernel/result.js';
import { err, ok } from '../../../shared/kernel/result.js';
import type { SpeechSynthesisPort, VozRequerida } from '../application/ports/speech-synthesis.port.js';

/** Aproximado de habla en espanol. Anima el indicador de "hablando" sin una segunda llamada de speech marks. */
const CARACTERES_POR_SEGUNDO = 14;

export class PollySpeechAdapter implements SpeechSynthesisPort {
  private readonly client: PollyClient;

  constructor(
    region: string,
    private readonly engine: PollyEngine,
    private readonly voiceFemale: string,
    private readonly voiceMale: string,
  ) {
    this.client = new PollyClient({ region });
  }

  /**
   * La voz sigue al GENERO del lead, no a un hash: una Laura con voz de hombre
   * rompe la simulacion en el primer segundo. Sigue siendo deterministica
   * porque el genero se infiere del nombre, que no cambia entre llamadas.
   */
  voiceFor(input: VozRequerida): SimulatedVoice {
    return {
      voiceId: input.genero === 'femenino' ? this.voiceFemale : this.voiceMale,
      engine: this.engine,
      languageCode: 'es-MX',
    };
  }

  async synthesize(input: VozRequerida & { texto: string }): Promise<Result<CallTurnAudio>> {
    const voz = this.voiceFor(input);

    const primerIntento = await this.intentarSintetizar(input.texto, voz.voiceId, this.engine);
    if (primerIntento.ok) {
      return primerIntento;
    }

    // Fallback UNA vez a `neural` si `generative` no esta habilitado para esta
    // cuenta/voz.
    if (this.engine === 'generative') {
      const reintento = await this.intentarSintetizar(input.texto, voz.voiceId, 'neural');
      if (reintento.ok) {
        return reintento;
      }
    }

    // Nunca bloquea el turno: el use case trata este `err` como "sin audio".
    return err(new DataUnavailableError('No se pudo sintetizar voz con Polly'));
  }

  private async intentarSintetizar(
    texto: string,
    voiceId: string,
    engine: PollyEngine,
  ): Promise<Result<CallTurnAudio>> {
    try {
      const respuesta = await this.client.send(
        new SynthesizeSpeechCommand({
          Text: texto,
          // La voz sale de env (`POLLY_VOICE_{FEMALE,MALE}`), fuera del enum
          // estricto del SDK en tiempo de compilacion. Un valor invalido falla
          // en runtime con un error de AWS, capturado abajo — nunca un crash.
          VoiceId: voiceId as VoiceId,
          OutputFormat: 'mp3',
          // `PollyEngine` (nuestro contrato) es un subconjunto de `PollySdkEngine`
          // (el SDK tambien admite `long-form`, que no usamos): la asignacion
          // widening no necesita cast.
          Engine: engine,
        }),
      );

      if (respuesta.AudioStream === undefined) {
        return err(new DataUnavailableError('Polly no devolvio audio'));
      }

      const bytes = await respuesta.AudioStream.transformToByteArray();
      const base64 = Buffer.from(bytes).toString('base64');

      return ok({
        base64,
        contentType: 'audio/mpeg',
        duracionMs: Math.round((texto.length / CARACTERES_POR_SEGUNDO) * 1000),
      });
    } catch {
      // Credenciales invalidas, region sin el motor, voz no soportada, red
      // caida: todo colapsa a "sin audio" para el llamador (nunca un throw).
      return err(new DataUnavailableError('Polly rechazo la solicitud de sintesis'));
    }
  }
}
