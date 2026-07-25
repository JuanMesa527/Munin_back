import { describe, expect, it } from 'vitest';
import type { ClockPort } from '@shared/application/ports/clock.port.js';
import { UnauthorizedError } from '@shared/kernel/errors.js';
import { InMemoryLeadOtpStore } from './in-memory-lead-otp.store.js';

const AHORA_MS = Date.parse('2026-07-25T15:00:00.000Z');

function fixedClock(nowMs = AHORA_MS): ClockPort {
  return {
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
  };
}

describe('InMemoryLeadOtpStore', () => {
  it('genera un codigo de 6 digitos y lo verifica correctamente', async () => {
    const store = new InMemoryLeadOtpStore({ clock: fixedClock() });

    const generado = await store.requestOtp('lead-1');
    expect(generado.ok).toBe(true);
    if (!generado.ok) return;
    expect(generado.value.codigo).toMatch(/^\d{6}$/u);
    expect(generado.value.expiraEn).toBe('2026-07-25T15:05:00.000Z');

    const verificado = await store.verifyOtp('lead-1', generado.value.codigo);
    expect(verificado).toEqual({ ok: true, value: undefined });
  });

  it('rechaza un codigo incorrecto sin distinguir el motivo', async () => {
    const store = new InMemoryLeadOtpStore({ clock: fixedClock() });
    await store.requestOtp('lead-1');

    const result = await store.verifyOtp('lead-1', '000000');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(UnauthorizedError);
  });

  it('el codigo es de un solo uso: verificarlo dos veces falla la segunda', async () => {
    const store = new InMemoryLeadOtpStore({ clock: fixedClock() });
    const generado = await store.requestOtp('lead-1');
    if (!generado.ok) throw new Error('setup invalido');

    await store.verifyOtp('lead-1', generado.value.codigo);
    const segundaVez = await store.verifyOtp('lead-1', generado.value.codigo);

    expect(segundaVez.ok).toBe(false);
  });

  it('rechaza el codigo tras vencer su TTL', async () => {
    let nowMs = AHORA_MS;
    const clock: ClockPort = {
      now: () => new Date(nowMs).toISOString(),
      nowMs: () => nowMs,
    };
    const store = new InMemoryLeadOtpStore({ clock });
    const generado = await store.requestOtp('lead-1');
    if (!generado.ok) throw new Error('setup invalido');

    nowMs += 5 * 60 * 1000 + 1;
    const result = await store.verifyOtp('lead-1', generado.value.codigo);

    expect(result.ok).toBe(false);
  });

  it('bloquea el codigo tras agotar los intentos permitidos', async () => {
    const store = new InMemoryLeadOtpStore({ clock: fixedClock() });
    const generado = await store.requestOtp('lead-1');
    if (!generado.ok) throw new Error('setup invalido');
    const codigoIncorrecto = generado.value.codigo === '000000' ? '111111' : '000000';

    for (let intento = 0; intento < 5; intento += 1) {
      await store.verifyOtp('lead-1', codigoIncorrecto);
    }
    // El codigo correcto ya no sirve: se quemo el registro tras el 5to intento fallido.
    const result = await store.verifyOtp('lead-1', generado.value.codigo);

    expect(result.ok).toBe(false);
  });

  it('pedir un OTP nuevo invalida el anterior', async () => {
    const store = new InMemoryLeadOtpStore({ clock: fixedClock() });
    const primero = await store.requestOtp('lead-1');
    if (!primero.ok) throw new Error('setup invalido');
    await store.requestOtp('lead-1');

    const result = await store.verifyOtp('lead-1', primero.value.codigo);

    expect(result.ok).toBe(false);
  });
});
