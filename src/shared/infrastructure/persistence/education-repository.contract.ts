import { describe, expect, it } from 'vitest';
import type { EducationJourney } from '@contracts';
import { ETAPAS_CAMINO } from '@contracts';
import type { EducationJourneyRepository } from '../../application/ports/education-repository.port.js';
import { NotFoundError } from '../../kernel/errors.js';

export function educationJourney(leadId: string): EducationJourney {
  return {
    leadId,
    plan: {
      precioObjetivo: 150_000_000,
      subsidioEstimado: 30_000_000,
      cuotaInicialObjetivo: 45_000_000,
      gap: 20_000_000,
      mesesParaCalificar: 12,
      proyectoObjetivoId: 'project-1',
      aplicaSubsidio: true,
    },
    metas: [
      {
        id: 'meta-ahorro',
        titulo: 'Cerra tu brecha de ahorro',
        descripcion: 'Registra tus aportes hasta alcanzar la meta de ahorro.',
        tipo: 'ahorro',
        objetivo: 20_000_000,
        alcanzado: 5_000_000,
        completada: false,
        puntos: 100,
        badgeId: 'badge-ahorrador',
        etapa: 'capacidad',
        aportes: [{ id: 'aporte-1', monto: 5_000_000, ocurridoEn: '2026-07-25T10:00:00.000Z' }],
      },
      {
        id: 'meta-afiliacion',
        titulo: 'Inicia tu afiliacion',
        descripcion: 'Afiliarte a la caja abre el subsidio y el credito social.',
        tipo: 'afiliacion',
        objetivo: 1,
        alcanzado: 1,
        completada: true,
        puntos: 80,
        badgeId: 'badge-afiliado',
        etapa: 'descubrir',
        completadaEn: '2026-07-20T09:00:00.000Z',
      },
    ],
    progreso: 0,
    puntosTotales: 0,
    badges: [
      {
        id: 'badge-ahorrador',
        nombre: 'Ahorrador',
        descripcion: 'Cerraste la brecha de ahorro hacia tu meta',
        icono: 'piggy-bank',
        desbloqueadoEn: null,
      },
    ],
    reclasificadoAViable: false,
    razonesIngreso: ['ahorro_insuficiente'],
    etapas: [...ETAPAS_CAMINO],
    actualizadoEn: '2026-07-25T10:00:00.000Z',
  };
}

export function runEducationRepositoryContract(
  adapterName: string,
  createRepository: () => EducationJourneyRepository,
): void {
  describe(`${adapterName} cumple EducationJourneyRepository`, () => {
    it('guarda y recupera un journey completo', async () => {
      const repository = createRepository();
      const journey = educationJourney('lead-round-trip');

      expect(await repository.save(journey)).toEqual({ ok: true, value: journey });
      expect(await repository.findByLeadId(journey.leadId)).toEqual({ ok: true, value: journey });
    });

    it('devuelve NotFoundError para un lead sin journey', async () => {
      const repository = createRepository();

      const result = await repository.findByLeadId('missing');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it('un segundo save sobre el mismo lead actualiza en vez de duplicar', async () => {
      const repository = createRepository();
      const journey = educationJourney('lead-upsert');

      await repository.save(journey);
      const actualizado = { ...journey, progreso: 1, puntosTotales: 100 };
      await repository.save(actualizado);

      const result = await repository.findByLeadId('lead-upsert');
      expect(result).toEqual({ ok: true, value: actualizado });
    });

    it('aisla entradas y salidas durante el round-trip', async () => {
      const repository = createRepository();
      const original = educationJourney('isolated');
      await repository.save(original);
      const [metaOriginal] = original.metas;
      if (metaOriginal === undefined) throw new Error('Fixture sin metas');
      metaOriginal.alcanzado = 999;

      const first = await repository.findByLeadId('isolated');
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const [metaPrimeraLectura] = first.value.metas;
      if (metaPrimeraLectura === undefined) throw new Error('Round-trip sin metas');
      expect(metaPrimeraLectura.alcanzado).toBe(5_000_000);
      metaPrimeraLectura.alcanzado = 111;

      const second = await repository.findByLeadId('isolated');
      expect(second.ok).toBe(true);
      if (second.ok) {
        const [metaSegundaLectura] = second.value.metas;
        expect(metaSegundaLectura?.alcanzado).toBe(5_000_000);
      }
    });
  });
}
