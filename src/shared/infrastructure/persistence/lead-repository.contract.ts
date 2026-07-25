import { describe, expect, it } from 'vitest';
import type { Carril, EnrichedLead, LeadListFilters, LeadProfile } from '@contracts';
import type { LeadRepository } from '../../application/ports/lead-repository.port.js';
import { NotFoundError } from '../../kernel/errors.js';

export const NO_FILTERS: LeadListFilters = {
  soloAfiliados: null,
  soloNutridos: null,
  segmento: null,
  ciudad: null,
  scoreMinimo: null,
  banda: null,
  busqueda: null,
};

export function leadProfile(id: string, score = 80, carril: Carril = 'viable'): LeadProfile {
  const timestamp = `2026-07-25T${score === 90 ? '11' : '10'}:00:00.000Z`;
  return {
    id,
    consentimiento: {
      otorgado: true,
      versionPolitica: 'test-v1',
      finalidades: ['perfilamiento_vivienda', 'contacto_comercial'],
      otorgadoEn: timestamp,
      canal: 'web-chat',
    },
    identidad: null,
    nombre: null,
    email: null,
    telefono: null,
    edad: null,
    estadoCivil: null,
    esAfiliado: true,
    rangoSalarial: '2-4 SMMLV',
    segmento: 'Basico',
    personasACargo: 2,
    ciudad: 'Bogota',
    segmentoFamiliar: 'Pareja con hijos',
    ahorroDeclarado: 20_000_000,
    capacidadAhorroMensual: 1_000_000,
    tieneVivienda: null,
    vinculacionLaboral: null,
    horizonteCompra: null,
    slotsLlenos: ['afiliacion', 'rangoSalarial'],
    capacidad: {
      banda: 'media',
      faltantes: ['ahorro'],
      cuotaMensualEstimada: 900_000,
      precioMaximoEstimado: 200_000_000,
    },
    score: {
      valor: score,
      factores: [
        {
          nombre: 'afiliacion',
          peso: 0.3,
          valor: 'Afiliado',
          contribucion: 24,
          intensidad: 80,
        },
      ],
      weightsVersion: 'test-v1',
      calculadoEn: timestamp,
    },
    proyectos: [
      {
        proyectoId: 'project-1',
        similitud: 0.91,
        razon: 'Coincide con capacidad y zona',
        nombre: 'Proyecto Uno',
        etapa: 'Etapa 1',
        precioDesde: 180_000_000,
        tipologia: 'VIS · 3 hab',
      },
    ],
    carril,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function enrichedLead(id: string, score = 80, carril: Carril = 'viable'): EnrichedLead {
  const base = leadProfile(id, score, carril);
  return {
    ...base,
    identidad: {
      nombre: `Lead ${id}`,
      telefonoEnmascarado: '+57 3.. ... ..42',
      contactoTokenId: `token-${id}`,
    },
    intereses: ['zonas verdes'],
    zonaPreferida: 'Sur',
    timingCompra: '6 meses',
    motivacion: 'Vivienda familiar',
    contacto: {
      canalPreferido: 'telefono',
      mejorHorario: 'tarde',
    },
    intentScore: score,
    enriquecidoEn: base.updatedAt,
    edad: 34,
    ocupacion: 'Independiente',
    hogar: '2 personas a cargo',
    ingresosSmmlv: 3.2,
    subsidioEstimado: 30_000_000,
    citaTextual: 'Quiero una vivienda para mi familia',
    contactabilidad: [{ dia: 'L', intensidad: 100 }],
    horarioRazon: 'Respondio en la tarde',
    timeline: [
      { label: 'Ingreso', fecha: '25 jul, 10:00', hito: 'ingreso' },
      { label: 'Viable', fecha: '25 jul, 10:15', hito: 'viable' },
    ],
  };
}

export function runLeadRepositoryContract(
  adapterName: string,
  createRepository: () => LeadRepository,
): void {
  describe(`${adapterName} cumple LeadRepository`, () => {
    it('guarda y recupera un perfil base completo', async () => {
      const repository = createRepository();
      const lead = leadProfile('base-round-trip');

      expect(await repository.save(lead)).toEqual({ ok: true, value: lead });
      expect(await repository.findById(lead.id)).toEqual({ ok: true, value: lead });
    });

    it('guarda y recupera un lead enriquecido y refresca la vista base', async () => {
      const repository = createRepository();
      const lead = enrichedLead('enriched-round-trip');

      expect(await repository.saveEnriched(lead)).toEqual({ ok: true, value: lead });
      expect(await repository.findEnrichedById(lead.id)).toEqual({
        ok: true,
        value: lead,
      });
      expect(await repository.findById(lead.id)).toEqual({ ok: true, value: lead });
    });

    it('devuelve NotFoundError para vistas base y enriquecida ausentes', async () => {
      const repository = createRepository();

      const base = await repository.findById('missing');
      const enriched = await repository.findEnrichedById('missing');

      expect(base.ok).toBe(false);
      expect(enriched.ok).toBe(false);
      if (!base.ok) expect(base.error).toBeInstanceOf(NotFoundError);
      if (!enriched.ok) expect(enriched.error).toBeInstanceOf(NotFoundError);
    });

    it('lista solo viables con el mismo filtrado, ranking y paginacion', async () => {
      const repository = createRepository();
      await repository.saveEnriched(enrichedLead('intent-60', 60));
      await repository.saveEnriched(enrichedLead('intent-90', 90));
      await repository.saveEnriched(enrichedLead('not-viable', 99, 'no_viable'));

      const result = await repository.listViable(
        { ...NO_FILTERS, scoreMinimo: 70 },
        'intent_desc',
        1,
        20,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items.map((item) => item.leadId)).toEqual(['intent-90']);
        expect(result.value.total).toBe(1);
      }
    });

    it('aisla entradas y salidas durante el round-trip', async () => {
      const repository = createRepository();
      const original = enrichedLead('isolated');
      await repository.saveEnriched(original);
      if (original.identidad === null) throw new Error('Fixture sin identidad');
      original.identidad.nombre = 'Mutado fuera';

      const first = await repository.findEnrichedById('isolated');
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value.identidad?.nombre).toBe('Lead isolated');
      if (first.value.identidad === null) throw new Error('Round-trip sin identidad');
      first.value.identidad.nombre = 'Mutado desde salida';

      const second = await repository.findEnrichedById('isolated');
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value.identidad?.nombre).toBe('Lead isolated');
      }
    });
  });
}
