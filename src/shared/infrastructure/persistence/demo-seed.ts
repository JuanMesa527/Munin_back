/**
 * Leads semilla para la demo. Capa: infrastructure.
 *
 * POR QUE EXISTE: F2.1 arranca desde un lead que ya fue perfilado y enrutado
 * como viable por F1. Mientras F1 no exista, sin semilla no hay nada que
 * mostrar y la pantalla no se puede ni abrir. Cuando F1 entre, estos leads
 * dejan de ser el camino principal y quedan solo como datos de prueba.
 *
 * PROHIBICION DURA (EQUIPO.md seccion 8): cero PII real. Los contactos son
 * completamente ficticios (dominio example.com / prefijo 300) y el telefono
 * solo se entrega al `ContactVaultPort`; nunca se registra ni se incorpora
 * directamente al perfil tokenizado (`identidad`).
 *
 * Solo se siembra fuera de produccion. `app.ts` lo hace explicito.
 */

import type { ConsentRecord, LeadProfile, Slot } from '@contracts';
import type { ContactVaultPort } from '../../application/ports/contact-vault.port.js';
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
 * Contactos ficticios del vault, indexados por el `id` del lead. Las llaves son
 * los UUID de `LEADS_DEMO` (ver la nota de abajo), no los slugs viejos: si se
 * desincronizan, el seed loguea "falta el contacto ficticio" y F4 se queda sin
 * telefono que revelar.
 */
const CONTACTOS_DEMO: Readonly<Record<string, { nombre: string; telefono: string }>> = {
  '8f14e45f-ce0a-4d1b-9a6f-1c0a2b3d4e51': { nombre: 'DemoFamilia', telefono: '+57 300 000 0042' },
  '8f14e45f-ce0a-4d1b-9a6f-1c0a2b3d4e52': { nombre: 'DemoJoven', telefono: '+57 300 000 0057' },
  '8f14e45f-ce0a-4d1b-9a6f-1c0a2b3d4e53': { nombre: 'DemoAlto', telefono: '+57 300 000 0081' },
};

const SLOTS_COMPLETOS: Slot[] = [
  'nombre',
  'email',
  'telefono',
  'edad',
  'estadoCivil',
  'afiliacion',
  'rangoSalarial',
  'segmento',
  'personasACargo',
  'ciudad',
  'segmentoFamiliar',
  'ahorro',
  'capacidadAhorroMensual',
];

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
    // UUID fijo, no el slug `demo-familia-soacha`: la columna `id` de Supabase
    // es `uuid` y rechazaba el texto, tumbando el arranque con el driver real.
    // Quemados y no generados para que el mismo lead sobreviva a los reinicios.
    id: '8f14e45f-ce0a-4d1b-9a6f-1c0a2b3d4e51',
    consentimiento: { ...consentimiento, finalidades: [...consentimiento.finalidades] },
    identidad: null,
    nombre: 'Laura Demo',
    email: 'laura.demo@example.com',
    telefono: '3001112233',
    edad: 34,
    estadoCivil: 'Casado/a',
    ocupacion: 'Empleado',
    esAfiliado: true,
    rangoSalarial: '2-4 SMMLV',
    segmento: 'Basico',
    personasACargo: 3,
    ciudad: 'Soacha',
    segmentoFamiliar: 'Pareja con hijos',
    ahorroDeclarado: 18_000_000,
    capacidadAhorroMensual: 850_000,
    slotsLlenos: [...SLOTS_COMPLETOS],
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
    id: '8f14e45f-ce0a-4d1b-9a6f-1c0a2b3d4e52',
    consentimiento: { ...consentimiento, finalidades: [...consentimiento.finalidades] },
    identidad: null,
    nombre: 'Camila Demo',
    email: 'camila.demo@example.com',
    telefono: '3002223344',
    edad: 26,
    estadoCivil: 'Soltero/a',
    ocupacion: 'Independiente',
    esAfiliado: true,
    rangoSalarial: '2-4 SMMLV',
    segmento: 'Joven',
    personasACargo: 0,
    ciudad: 'Bogota',
    segmentoFamiliar: 'Unipersonal',
    ahorroDeclarado: 9_000_000,
    capacidadAhorroMensual: 600_000,
    slotsLlenos: [...SLOTS_COMPLETOS],
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
    id: '8f14e45f-ce0a-4d1b-9a6f-1c0a2b3d4e53',
    consentimiento: { ...consentimiento, finalidades: [...consentimiento.finalidades] },
    identidad: null,
    nombre: 'Andrés Demo',
    email: 'andres.demo@example.com',
    telefono: '3003334455',
    edad: 41,
    estadoCivil: 'Unión libre',
    ocupacion: 'Empleado',
    esAfiliado: true,
    rangoSalarial: '6-10 SMMLV',
    segmento: 'Alto',
    personasACargo: 2,
    ciudad: 'Bogota',
    segmentoFamiliar: 'Pareja con hijos',
    ahorroDeclarado: 70_000_000,
    capacidadAhorroMensual: 2_400_000,
    slotsLlenos: [...SLOTS_COMPLETOS],
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

/** Siembra los leads de demo y sus contactos ficticios. Llamalo solo fuera de produccion. */
export async function seedDemoLeads(leads: LeadRepository, vault: ContactVaultPort): Promise<void> {
  for (const lead of LEADS_DEMO) {
    const contacto = CONTACTOS_DEMO[lead.id];
    if (contacto === undefined) {
      logger.error({ leadId: lead.id }, 'falta el contacto ficticio del lead de demo');
      return;
    }
    const identidad = await vault.store(contacto);
    if (!identidad.ok) {
      logger.error({ leadId: lead.id }, 'no se pudo guardar el contacto ficticio de demo');
      return;
    }
    const guardado = await leads.save({ ...lead, identidad: identidad.value });
    if (!guardado.ok) {
      logger.warn({ leadId: lead.id, err: guardado.error }, 'No se pudo sembrar lead de demo');
    }
  }
  logger.info({ cantidad: LEADS_DEMO.length }, 'Leads de demo sembrados');
}
