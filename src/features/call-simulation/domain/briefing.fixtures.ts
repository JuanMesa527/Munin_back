/**
 * Fixture de `BriefingSheet` para los tests de dominio de call-simulation.
 * Deliberadamente separado de `demo-seed.ts` (ese es infra/persistencia real);
 * esto es SOLO forma de datos para probar funciones puras sin red ni Supabase.
 */

import type { BriefingSheet, EnrichedLead } from '@contracts';

const LEAD_BASE: EnrichedLead = {
  id: 'fixture-lead-1',
  consentimiento: {
    otorgado: true,
    versionPolitica: 'test-v1',
    finalidades: ['perfilamiento_vivienda', 'contacto_comercial'],
    otorgadoEn: '2026-07-01T10:00:00.000Z',
    canal: 'test',
  },
  nombre: 'Laura Restrepo M.',
  email: 'laura.fixture@example.com',
  telefono: '3001234542',
  estadoCivil: 'Union libre',
  esAfiliado: true,
  rangoSalarial: '2-4 SMMLV',
  segmento: 'Medio',
  personasACargo: 2,
  ciudad: 'Bogota',
  segmentoFamiliar: 'Familia con hijos',
  ahorroDeclarado: 8_000_000,
  capacidadAhorroMensual: 400_000,
  tieneVivienda: null,
  vinculacionLaboral: null,
  horizonteCompra: null,
  slotsLlenos: [],
  capacidad: {
    banda: 'media',
    faltantes: [],
    cuotaMensualEstimada: 1_100_000,
    precioMaximoEstimado: 230_000_000,
  },
  score: { valor: 72, factores: [], weightsVersion: 'test', calculadoEn: '2026-07-20T10:00:00.000Z' },
  proyectos: [],
  carril: 'viable',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
  identidad: {
    nombre: 'Laura Restrepo M.',
    telefonoEnmascarado: '+57 3.. ... ..42',
    contactoTokenId: 'token-fixture-1',
  },
  intereses: ['Gimnasio', 'Zonas verdes'],
  zonaPreferida: 'norte',
  timingCompra: 'En los proximos 3 meses',
  motivacion: 'Quiere dejar de pagar arriendo',
  contacto: null,
  intentScore: 68,
  enriquecidoEn: '2026-07-20T10:05:00.000Z',
  edad: 34,
  ocupacion: 'Enfermera',
  hogar: '2 personas a cargo',
  ingresosSmmlv: 3,
  subsidioEstimado: 15_000_000,
  citaTextual: 'Necesito algo cerca del colegio de mi hija',
  contactabilidad: [],
  horarioRazon: null,
  timeline: [],
};

/** Telefono FICTICIO usado solo para el test "el prompt no filtra PII". */
export const TELEFONO_ENMASCARADO_FIXTURE = LEAD_BASE.identidad?.telefonoEnmascarado ?? '';

export function briefingFixture(overrides: Partial<BriefingSheet> = {}): BriefingSheet {
  return {
    lead: LEAD_BASE,
    journey: null,
    talkingPoints: [
      {
        titulo: 'Menciona el subsidio estimado',
        detalle: 'Tiene 3 SMMLV: aplica al SFV. Nunca decir "aprobado", solo "estimado".',
        origen: 'capacidad',
        prioridad: 1,
      },
      {
        titulo: 'Habla del proyecto con mejor match',
        detalle: 'El match top tiene 82% de afinidad con su perfil.',
        origen: 'matching',
        prioridad: 2,
      },
      {
        titulo: 'Usa su propia motivacion',
        detalle: 'Quiere dejar de pagar arriendo: conecta el ahorro con eso.',
        origen: 'intereses',
        prioridad: 3,
      },
    ],
    alertas: [],
    generadoEn: '2026-07-25T09:00:00.000Z',
    resumenScore: 'Score estimado en 72 por afiliacion vigente y capacidad de pago sostenida.',
    objeciones: [
      {
        pregunta: 'Eso del subsidio, ¿de verdad me lo dan?',
        respuesta: 'Es un estimado sujeto a verificacion, no una aprobacion.',
      },
      {
        pregunta: 'Es muy lejos de mi trabajo.',
        respuesta: 'Hay ruta directa y el proyecto queda a 10 min del colegio de tu hija.',
      },
    ],
    ...overrides,
  };
}
