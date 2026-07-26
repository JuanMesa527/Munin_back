/**
 * Generador y verificador de OTP para el login del lead (F2.2). Capa:
 * infrastructure (adapter de `LeadOtpPort`).
 *
 * OWASP A02 (fallas criptograficas): el codigo se genera con `randomInt` del
 * CSPRNG (nunca `Math.random`, y nunca `randomBytes % N`, que sesga la
 * distribucion) y se guarda HASHEADO (SHA-256), igual criterio que el token de
 * sesion — un volcado de memoria no entrega codigos utilizables.
 *
 * OWASP A07 (fuerza bruta): un OTP de 6 digitos tiene solo 10^6 combinaciones —
 * MUY chico comparado con los 256 bits del token de sesion — asi que ademas del
 * TTL corto hace falta un limite EXPLICITO de intentos por codigo; el token de
 * sesion no lo necesita porque su espacio es astronomicamente mas grande.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { IsoDateTime } from '@contracts';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import type { LeadOtpPort } from '@shared/application/ports/lead-auth.port.js';
import { UnauthorizedError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';

/** 5 minutos: alcanza para leer un SMS/correo sin dejar una ventana larga de fuerza bruta. */
const OTP_TTL_MS = 5 * 60 * 1000;

/** 5 intentos por codigo: agota el margen de error humano sin habilitar fuerza bruta sobre 10^6 valores. */
const OTP_MAX_ATTEMPTS = 5;

interface OtpRecord {
  readonly codigoHash: string;
  readonly expiraEnMs: number;
  intentos: number;
}

export interface InMemoryLeadOtpStoreDeps {
  readonly clock: ClockPort;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export class InMemoryLeadOtpStore implements LeadOtpPort {
  /** Clave = `leadId`: a lo sumo un OTP vivo por lead a la vez. */
  private readonly codigos = new Map<string, OtpRecord>();

  constructor(private readonly deps: InMemoryLeadOtpStoreDeps) {}

  requestOtp(leadId: string): Promise<Result<{ codigo: string; expiraEn: IsoDateTime }>> {
    // Pedir un OTP nuevo invalida cualquiera anterior: no tiene sentido dejar
    // dos codigos vivos para el mismo lead.
    const codigo = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiraEnMs = this.deps.clock.nowMs() + OTP_TTL_MS;
    this.codigos.set(leadId, { codigoHash: digest(codigo), expiraEnMs, intentos: 0 });
    return Promise.resolve(ok({ codigo, expiraEn: new Date(expiraEnMs).toISOString() }));
  }

  verifyOtp(leadId: string, codigo: string): Promise<Result<void>> {
    const registro = this.codigos.get(leadId);
    const invalido = (): Result<never> => err(new UnauthorizedError('Codigo invalido o vencido'));

    if (registro === undefined) return Promise.resolve(invalido());
    if (registro.expiraEnMs <= this.deps.clock.nowMs()) {
      this.codigos.delete(leadId);
      return Promise.resolve(invalido());
    }
    if (registro.intentos >= OTP_MAX_ATTEMPTS) {
      this.codigos.delete(leadId);
      return Promise.resolve(invalido());
    }

    const coincide = timingSafeEqual(
      Buffer.from(digest(codigo), 'hex'),
      Buffer.from(registro.codigoHash, 'hex'),
    );
    if (!coincide) {
      registro.intentos += 1;
      if (registro.intentos >= OTP_MAX_ATTEMPTS) this.codigos.delete(leadId);
      return Promise.resolve(invalido());
    }

    // Un solo uso: verificado (o quemado por intentos), el codigo desaparece.
    this.codigos.delete(leadId);
    return Promise.resolve(ok(undefined));
  }
}
