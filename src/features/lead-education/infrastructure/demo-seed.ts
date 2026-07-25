/**
 * Semilla de leads de demo para F2.2. Capa: infrastructure (propia de la feature).
 *
 * POR QUE EXISTE: F1 (lead-intake) todavia no esta implementada, asi que no hay
 * forma de crear un lead y el carril de nutricion quedaria vacio en la demo.
 * Esto siembra perfiles NO VIABLES para que el jurado pueda recorrer el camino
 * de forma autogestionada. Cuando F1 exista, esta semilla se puede borrar.
 *
 * LEGAL: datos completamente FICTICIOS. Sin cedulas, sin telefonos, sin PII
 * real. Los nombres son inventados y no corresponden a ninguna persona.
 * Solo se siembra fuera de produccion.
 */

import type { IsoDateTime, LeadProfile } from '@contracts';
import type { LeadRepository } from '@shared/application/ports/index.js';
import { createEmptyLeadProfile } from '@shared/domain/index.js';

/** Perfiles semilla: tres situaciones distintas del carril no viable. */
function perfilesDemo(now: IsoDateTime): LeadProfile[] {
  const base = (id: string): LeadProfile => ({
    ...createEmptyLeadProfile(id, now),
    consentimiento: {
      otorgado: true,
      versionPolitica: 'demo-1',
      finalidades: ['perfilamiento_vivienda', 'educacion_financiera'],
      otorgadoEn: now,
      canal: 'web-chat',
    },
    carril: 'no_viable',
  });

  return [
    {
      // Aspira al SFV (<= 4 SMMLV) pero le falta ahorro.
      ...base('demo-lead-1'),
      nombre: 'Laura Demo',
      email: 'laura.demo@example.com',
      telefono: '3001112233',
      edad: 34,
      estadoCivil: 'Casado/a',
      esAfiliado: true,
      rangoSalarial: '2-4 SMMLV',
      segmento: 'Medio',
      personasACargo: 2,
      ciudad: 'Bogotá',
      segmentoFamiliar: 'Pareja con hijos',
      ahorroDeclarado: 8_000_000,
      capacidadAhorroMensual: 700_000,
    },
    {
      // No afiliado: suma la meta de afiliacion al camino.
      ...base('demo-lead-2'),
      nombre: 'Camila Demo',
      email: 'camila.demo@example.com',
      telefono: '3002223344',
      edad: 26,
      estadoCivil: 'Soltero/a',
      esAfiliado: false,
      rangoSalarial: '0-2 SMMLV',
      segmento: 'Basico',
      personasACargo: 1,
      ciudad: 'Bogotá',
      segmentoFamiliar: 'Monoparental',
      ahorroDeclarado: 2_500_000,
      capacidadAhorroMensual: 350_000,
    },
    {
      // Por encima del tope del SFV: el camino no muestra subsidio.
      ...base('demo-lead-3'),
      nombre: 'Andrés Demo',
      email: 'andres.demo@example.com',
      telefono: '3003334455',
      edad: 41,
      estadoCivil: 'Unión libre',
      esAfiliado: true,
      rangoSalarial: '4-6 SMMLV',
      segmento: 'Alto',
      personasACargo: 0,
      ciudad: 'Medellín',
      segmentoFamiliar: 'Unipersonal',
      ahorroDeclarado: 15_000_000,
      capacidadAhorroMensual: 1_200_000,
    },
  ];
}

/** Siembra los perfiles de demo. Idempotente: sobrescribe por id. */
export async function seedDemoLeads(leads: LeadRepository, now: IsoDateTime): Promise<void> {
  for (const perfil of perfilesDemo(now)) {
    await leads.save(perfil);
  }
}
