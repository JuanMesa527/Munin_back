import { describe, expect, it } from 'vitest';
import type { ClockPort, IdGeneratorPort } from '@shared/application/ports/index.js';
import { InMemoryEducationRepository } from '@shared/infrastructure/persistence/in-memory/in-memory-education.repository.js';
import { InMemoryLeadRepository } from '@shared/infrastructure/persistence/in-memory/in-memory-lead.repository.js';
import { createEmptyLeadProfile } from '@shared/domain/index.js';
import { buildGamifiedJourney } from '../domain/journey.js';
import { RecordProgressUseCase } from './record-progress.use-case.js';

const NOW = '2026-07-25T00:00:00.000Z';

/** Reloj determinista de test: siempre devuelve `NOW`. */
const clock: ClockPort = {
  now: () => NOW,
  nowMs: () => new Date(NOW).getTime(),
};

/** Generador de ids determinista de test: secuencia estable, sin CSPRNG. */
function stubIds(): IdGeneratorPort {
  let n = 0;
  return {
    newId: () => `id-${String((n += 1))}`,
  };
}

async function setup(): Promise<{
  journeys: InMemoryEducationRepository;
  leads: InMemoryLeadRepository;
  useCase: RecordProgressUseCase;
}> {
  const journeys = new InMemoryEducationRepository();
  const leads = new InMemoryLeadRepository();
  const ids = stubIds();
  const useCase = new RecordProgressUseCase({ journeys, leads, clock, ids });

  const profile = { ...createEmptyLeadProfile('lead-1', NOW), esAfiliado: true };
  await leads.save(profile);

  const journey = buildGamifiedJourney({
    profile,
    routing: {
      carril: 'no_viable',
      razones: ['ahorro_insuficiente'],
      explicacion: 'Todavía no, pero acá está tu camino.',
      decididoEn: NOW,
    },
    plan: {
      precioObjetivo: 100_000_000,
      subsidioEstimado: 0,
      gap: 100_000_000,
      mesesParaCalificar: 10,
      proyectoObjetivoId: 'proj-1',
      aplicaSubsidio: false,
    },
    now: NOW,
  });
  await journeys.save(journey);

  return { journeys, leads, useCase };
}

describe('RecordProgressUseCase', () => {
  it('aplica el evento de progreso y agrega un aporte con id generado por IdGeneratorPort', async () => {
    const { journeys, useCase } = await setup();

    const resultado = await useCase.execute('lead-1', {
      tipo: 'ahorro_registrado',
      metaId: 'meta-ahorro',
      valor: 10_000_000,
      ocurridoEn: NOW,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ahorro = resultado.value.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.alcanzado).toBe(10_000_000);
    expect(ahorro?.aportes).toEqual([{ id: 'id-1', monto: 10_000_000, ocurridoEn: NOW }]);

    const persistido = await journeys.findByLeadId('lead-1');
    expect(persistido.ok && persistido.value.metas.find((m) => m.id === 'meta-ahorro')?.aportes).toEqual(
      [{ id: 'id-1', monto: 10_000_000, ocurridoEn: NOW }],
    );
  });

  it('cuando la request trae fechaObjetivo, configura la meta SIN tocar alcanzado/aportes', async () => {
    const { useCase } = await setup();

    const resultado = await useCase.execute(
      'lead-1',
      { tipo: 'ahorro_registrado', metaId: 'meta-ahorro', valor: 0, ocurridoEn: NOW },
      '2027-01-01T00:00:00.000Z',
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const ahorro = resultado.value.metas.find((m) => m.id === 'meta-ahorro');
    expect(ahorro?.fechaObjetivo).toBe('2027-01-01T00:00:00.000Z');
    expect(ahorro?.alcanzado).toBe(0);
    expect(ahorro?.aportes ?? []).toHaveLength(0);
  });

  it('fechaObjetivo sin metaId es un error de validacion', async () => {
    const { useCase } = await setup();

    const resultado = await useCase.execute(
      'lead-1',
      { tipo: 'contenido_visto', metaId: null, valor: 1, ocurridoEn: NOW },
      '2027-01-01T00:00:00.000Z',
    );

    expect(resultado.ok).toBe(false);
  });
});
