/**
 * Leads semilla para la demo. Capa: infrastructure.
 *
 * POR QUE EXISTE: F2.1 arranca desde un lead que ya fue perfilado y enrutado
 * como viable por F1. Mientras F1 no exista, sin semilla no hay nada que
 * mostrar y la pantalla no se puede ni abrir. Cuando F1 entre, estos leads
 * dejan de ser el camino principal y quedan solo como datos de prueba.
 *
 * PROHIBICION DURA (EQUIPO.md seccion 8): cero PII real. Los nombres son
 * claramente ficticios y NO hay cedula, telefono ni correo en ningun campo:
 * `LeadProfile` no tiene esos campos justamente por minimizacion de datos, y la
 * identidad de contacto la captura F2.1 detras de `ContactVaultPort`.
 *
 * Solo se siembra fuera de produccion. `app.ts` lo hace explicito.
 */

import type { ConsentRecord, LeadProfile } from '@contracts';
import type { LeadRepository } from '../../application/ports/lead-repository.port.js';
import { logger } from '../logging/logger.js';

/** Fecha fija: una semilla con `new Date()` haria irreproducible la demo. */
const SEMBRADO_EN = '2026-07-25T08:00:00.000Z';

/**
 * Consentimiento ya otorgado: estos leads representan a alguien que YA paso el
 * gate legal en F1. Sin esto, `BuildDeckUseCase` los rechaza, que es
 * exactamente lo que debe hacer.
 */
const consentimiento: ConsentRecord = {
  otorgado: true,
  versionPolitica: 'demo-v1',
  finalidades: ['perfilamiento_vivienda', 'contacto_comercial'],
  otorgadoEn: SEMBRADO_EN,
  canal: 'seed-demo',
};

/**
 * Tres perfiles que ejercitan carriles distintos del matching:
 *   - familia con dependientes y presupuesto ajustado -> VIS con 3 habitaciones;
 *   - hogar joven unipersonal en Bogota -> apartaestudio / coliving;
 *   - ingreso alto sin dependientes -> NO VIS de area grande.
 * Sirven para ver que el orden de la baraja CAMBIA con el perfil, que es lo que
 * hay que poder mostrarle a un jurado.
 */
export const LEADS_DEMO: readonly LeadProfile[] = [
  {
    id: 'demo-familia-soacha',
    consentimiento: { ...consentimiento, finalidades: [...consentimiento.finalidades] },
    esAfiliado: true,
    rangoSalarial: '2-4 SMMLV',
    segmento: 'Basico',
    personasACargo: 3,
    ciudad: 'Soacha',
    segmentoFamiliar: 'Pareja con hijos',
    ahorroDeclarado: 18_000_000,
    capacidadAhorroMensual: 850_000,
    slotsLlenos: [
      'afiliacion',
      'rangoSalarial',
      'segmento',
      'personasACargo',
      'ciudad',
      'segmentoFamiliar',
      'ahorro',
      'capacidadAhorroMensual',
    ],
    capacidad: {
      banda: 'media',
      faltantes: [],
      cuotaMensualEstimada: 950_000,
      precioMaximoEstimado: 210_000_000,
    },
    score: null,
    proyectos: [],
    carril: 'viable',
    createdAt: SEMBRADO_EN,
    updatedAt: SEMBRADO_EN,
  },
  {
    id: 'demo-joven-bogota',
    consentimiento: { ...consentimiento, finalidades: [...consentimiento.finalidades] },
    esAfiliado: true,
    rangoSalarial: '2-4 SMMLV',
    segmento: 'Joven',
    personasACargo: 0,
    ciudad: 'Bogota',
    segmentoFamiliar: 'Unipersonal',
    ahorroDeclarado: 9_000_000,
    capacidadAhorroMensual: 600_000,
    slotsLlenos: [
      'afiliacion',
      'rangoSalarial',
      'segmento',
      'personasACargo',
      'ciudad',
      'segmentoFamiliar',
      'ahorro',
      'capacidadAhorroMensual',
    ],
    capacidad: {
      banda: 'media',
      faltantes: [],
      cuotaMensualEstimada: 720_000,
      precioMaximoEstimado: 185_000_000,
    },
    score: null,
    proyectos: [],
    carril: 'viable',
    createdAt: SEMBRADO_EN,
    updatedAt: SEMBRADO_EN,
  },
  {
    id: 'demo-alto-bogota',
    consentimiento: { ...consentimiento, finalidades: [...consentimiento.finalidades] },
    esAfiliado: true,
    rangoSalarial: '6-10 SMMLV',
    segmento: 'Alto',
    personasACargo: 2,
    ciudad: 'Bogota',
    segmentoFamiliar: 'Pareja con hijos',
    ahorroDeclarado: 70_000_000,
    capacidadAhorroMensual: 2_400_000,
    slotsLlenos: [
      'afiliacion',
      'rangoSalarial',
      'segmento',
      'personasACargo',
      'ciudad',
      'segmentoFamiliar',
      'ahorro',
      'capacidadAhorroMensual',
    ],
    capacidad: {
      banda: 'alta',
      faltantes: [],
      cuotaMensualEstimada: 3_100_000,
      precioMaximoEstimado: 390_000_000,
    },
    score: null,
    proyectos: [],
    carril: 'viable',
    createdAt: SEMBRADO_EN,
    updatedAt: SEMBRADO_EN,
  },
];

/** Siembra los leads de demo. Llamalo solo fuera de produccion. */
export async function seedDemoLeads(leads: LeadRepository): Promise<void> {
  for (const lead of LEADS_DEMO) {
    const guardado = await leads.save(lead);
    if (!guardado.ok) {
      logger.error({ leadId: lead.id }, 'no se pudo sembrar el lead de demo');
      return;
    }
  }
  logger.info({ cuantos: LEADS_DEMO.length }, 'leads de demo sembrados');
}
