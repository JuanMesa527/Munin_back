/**
 * Motor de conversacion de F1 (lead-intake). Capa: domain (puro, sin I/O).
 * Llena `LeadProfile` con las 6 preguntas confirmadas por el product owner y
 * decide cuando la conversacion esta lista para enrutar.
 *
 * `parseAnswer` es deliberadamente PURO (design.md D1): no recibe `LlmPort`.
 * El caso de uso (application/, Fase 2) intenta `parseAnswer` primero; si
 * falla con texto libre, llama a `LlmPort.extractSlotValue` y alimenta el
 * `valor` devuelto DE VUELTA por `parseAnswer` — el LLM nunca entra al
 * dominio sin pasar por esta misma puerta de validacion.
 */

import {
  ESTADOS_CIVILES,
  RANGOS_SALARIALES_SMMLV,
  SEGMENTOS,
  SEGMENTOS_FAMILIARES,
} from '@contracts';
import type {
  BotMessage,
  COP,
  ConversationStep,
  IsoDateTime,
  LeadProfile,
  QuickReply,
  Segmento,
  Slot,
} from '@contracts';
import { isSlotFilled } from '@shared/domain/lead.js';
import { normalizePhoneDigits } from '@shared/domain/phone.js';
import { toSmmlvBounds } from '@shared/domain/value-objects/salary-range.js';
import { ValidationError } from '@shared/kernel/errors.js';
import type { Result } from '@shared/kernel/result.js';
import { err, ok } from '@shared/kernel/result.js';

/**
 * Union feature-interna de valores parseados. Mantiene las escrituras a
 * `LeadProfile` type-safe: cada `slot` solo puede traer el tipo de valor que
 * le corresponde en el contrato (design.md, seccion Interfaces/Contracts).
 */
export type SlotValue =
  | { slot: 'afiliacion'; valor: boolean }
  | {
      slot:
        | 'nombre'
        | 'email'
        | 'telefono'
        | 'estadoCivil'
        | 'ocupacion'
        | 'rangoSalarial'
        | 'ciudad'
        | 'segmentoFamiliar';
      valor: string;
    }
  | { slot: 'segmento'; valor: Segmento }
  | { slot: 'edad' | 'personasACargo'; valor: number }
  | { slot: 'ahorro' | 'capacidadAhorroMensual'; valor: COP };

/**
 * Slots que SI se preguntan. `segmento` y `personasACargo` se infieren en
 * `updateProfile` y nunca se presentan como pregunta.
 *
 * Orden: identidad de contacto primero (para saludar y perfil F2.2), luego
 * perfilamiento financiero.
 */
type AskedSlot =
  | 'nombre'
  | 'email'
  | 'telefono'
  | 'edad'
  | 'estadoCivil'
  | 'ocupacion'
  | 'afiliacion'
  | 'rangoSalarial'
  | 'segmentoFamiliar'
  | 'ciudad'
  | 'ahorro'
  | 'capacidadAhorroMensual';

/** Orden fijo del flujo. No reordenar sin anunciar. */
const ASKED_SLOTS: readonly AskedSlot[] = [
  'nombre',
  'email',
  'telefono',
  'edad',
  'estadoCivil',
  'ocupacion',
  'afiliacion',
  'rangoSalarial',
  'segmentoFamiliar',
  'ciudad',
  'ahorro',
  'capacidadAhorroMensual',
];

/** Ciudades sugeridas como chips. `permiteTextoLibre` sigue habilitado: no es exhaustivo. */
const CIUDADES_SUGERIDAS: readonly string[] = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla'];

/**
 * Ocupaciones sugeridas como chips. Igual que las ciudades: son un atajo de UI,
 * no un vocabulario cerrado — `parseOcupacion` acepta cualquier texto.
 */
const OCUPACIONES_SUGERIDAS: readonly string[] = [
  'Empleado',
  'Independiente',
  'Pensionado',
  'Estudiante',
];

/**
 * Los chips de ahorro son un atajo de UI: el dato que entra al dominio es el
 * monto en COP, no la etiqueta. Cada chip codifica un monto representativo
 * (aprox. el punto medio del tramo, o una referencia razonable en el tramo
 * abierto) como string numerico, para que `parseAnswer` lo procese con el
 * MISMO parser que usa para texto libre — sin logica especial por venir de
 * un chip. Decision de implementacion documentada (no especificada aguas
 * arriba): el hackathon prioriza simplicidad sobre precisión aquí.
 */
const AHORRO_CHIPS: readonly QuickReply[] = [
  { label: 'Menos de $10M', value: '5000000' },
  { label: '$10M - $30M', value: '20000000' },
  { label: '$30M - $60M', value: '45000000' },
  { label: 'Más de $60M', value: '70000000' },
];

/**
 * `capacidadAhorroMensual` es un monto MENSUAL, no un saldo total como
 * `ahorro` — reutilizar la escala de `AHORRO_CHIPS` (decenas de millones)
 * implicaria un ahorro mensual irreal para el segmento del reto. Los chips
 * usan una escala mensual propia; sigue el mismo patron (chips + texto libre).
 */
const CAPACIDAD_AHORRO_CHIPS: readonly QuickReply[] = [
  { label: 'Menos de $300 mil', value: '150000' },
  { label: '$300 mil - $800 mil', value: '550000' },
  { label: '$800 mil - $1.5M', value: '1150000' },
  { label: 'Más de $1.5M', value: '2000000' },
];

/** Copy y quickReplies por slot. No parafrasear el copy financiero ya confirmado. */
function copyFor(slot: AskedSlot): { texto: string; quickReplies: QuickReply[] } {
  switch (slot) {
    case 'nombre':
      return {
        texto: 'Para empezar, ¿cómo te llamas?',
        quickReplies: [],
      };
    case 'email':
      return {
        texto: '¿Cuál es tu correo electrónico?',
        quickReplies: [],
      };
    case 'telefono':
      return {
        texto: '¿A qué número de celular te podemos contactar?',
        quickReplies: [],
      };
    case 'edad':
      // SIN chips a proposito. Los tramos ('26-35' -> 30) guardaban un valor
      // representativo, no la edad del titular: la ficha del closer decia "30
      // años" de alguien de 27. Es un dato declarado, no una estimacion, y
      // ademas alimenta el subsidio de F2.2 — se pregunta exacto.
      return {
        texto: '¿Cuántos años tienes exactamente?',
        quickReplies: [],
      };
    case 'estadoCivil':
      return {
        texto: '¿Cuál es tu estado civil?',
        quickReplies: ESTADOS_CIVILES.map((estado) => ({ label: estado, value: estado })),
      };
    case 'ocupacion':
      // Chips como atajo, texto libre igual de valido (`permiteTextoLibre`):
      // "Rappitendero" o "Contratista del Estado" tienen que poder entrar tal
      // cual. El contrato la tipa `string | null`, no como vocabulario cerrado.
      return {
        texto: '¿A qué te dedicas?',
        quickReplies: OCUPACIONES_SUGERIDAS.map((ocupacion) => ({
          label: ocupacion,
          value: ocupacion,
        })),
      };
    case 'afiliacion':
      return {
        texto: '¿Estás afiliado a Colsubsidio?',
        quickReplies: [
          { label: 'Sí', value: 'true' },
          { label: 'No', value: 'false' },
        ],
      };
    case 'rangoSalarial':
      return {
        texto: '¿En qué rango están tus ingresos mensuales?',
        quickReplies: RANGOS_SALARIALES_SMMLV.map((rango) => ({ label: rango, value: rango })),
      };
    case 'segmentoFamiliar':
      return {
        texto: '¿Cómo es tu núcleo familiar?',
        quickReplies: SEGMENTOS_FAMILIARES.map((segmento) => ({
          label: segmento,
          value: segmento,
        })),
      };
    case 'ciudad':
      return {
        texto: '¿En qué ciudad buscás vivienda?',
        quickReplies: CIUDADES_SUGERIDAS.map((ciudad) => ({ label: ciudad, value: ciudad })),
      };
    case 'ahorro':
      return {
        texto: '¿Cuánto tenés ahorrado hoy para tu vivienda?',
        quickReplies: [...AHORRO_CHIPS],
      };
    case 'capacidadAhorroMensual':
      return {
        texto: '¿Cuánto podrías ahorrar por mes?',
        quickReplies: [...CAPACIDAD_AHORRO_CHIPS],
      };
  }
}

/**
 * Siguiente paso de la conversacion, o `null` cuando los slots preguntados
 * ya estan llenos (listo para enrutar). Sin rama de afiliacion a proposito
 * (spec "Non-Affiliation Never Short-Circuits the Flow", design.md D5): el
 * orden es fijo y no consulta `esAfiliado`.
 */
export function getNextStep(profile: LeadProfile): ConversationStep | null {
  const siguienteSlot = ASKED_SLOTS.find((slot) => !isSlotFilled(profile, slot));
  if (siguienteSlot === undefined) {
    return null;
  }
  const copia = copyFor(siguienteSlot);
  return {
    id: siguienteSlot,
    slot: siguienteSlot,
    tipo: 'pregunta',
    // Requisito duro: "MUST still accept free text" en todo paso de pregunta.
    permiteTextoLibre: true,
    quickReplies: copia.quickReplies,
  };
}

/** Slots preguntados aun vacios (orden fijo de `ASKED_SLOTS`). */
export function listPendingAskedSlots(profile: LeadProfile): readonly Slot[] {
  return ASKED_SLOTS.filter((slot) => !isSlotFilled(profile, slot));
}

/** Vocabulario cerrado (valores de chips) para un slot preguntado; `[]` si no aplica. */
export function vocabularyForAskedSlot(slot: Slot): readonly string[] {
  const asked = ASKED_SLOTS.find((candidato) => candidato === slot);
  if (asked === undefined) {
    return [];
  }
  return copyFor(asked).quickReplies.map((qr) => qr.value);
}

function parseVocabulario<T extends string>(
  texto: string,
  vocabulario: readonly T[],
  campo: string,
  build: (valor: T) => SlotValue,
): Result<SlotValue, ValidationError> {
  const encontrado = vocabulario.find((valor) => valor.toLowerCase() === texto.toLowerCase());
  if (encontrado === undefined) {
    return err(
      new ValidationError(`Valor no reconocido para ${campo}`, {
        [campo]: 'valor fuera del vocabulario conocido',
      }),
    );
  }
  return ok(build(encontrado));
}

const AFIRMATIVOS = new Set(['si', 'sí', 'true', 'yes']);
const NEGATIVOS = new Set(['no', 'false']);

function parseAfiliacion(texto: string): Result<SlotValue, ValidationError> {
  const normalizado = texto.toLowerCase();
  if (AFIRMATIVOS.has(normalizado)) {
    return ok({ slot: 'afiliacion', valor: true });
  }
  if (NEGATIVOS.has(normalizado)) {
    return ok({ slot: 'afiliacion', valor: false });
  }
  return err(
    new ValidationError('No se pudo interpretar la respuesta de afiliación', {
      afiliacion: 'esperado si/no',
    }),
  );
}

function parseCiudad(texto: string): Result<SlotValue, ValidationError> {
  if (texto.length === 0) {
    return err(new ValidationError('La ciudad no puede estar vacía', { ciudad: 'requerido' }));
  }
  if (texto.length > 100) {
    return err(
      new ValidationError('La ciudad es demasiado larga', { ciudad: 'máximo 100 caracteres' }),
    );
  }
  return ok({ slot: 'ciudad', valor: texto });
}

function parseOcupacion(texto: string): Result<SlotValue, ValidationError> {
  if (texto.length === 0) {
    return err(
      new ValidationError('La ocupación no puede estar vacía', { ocupacion: 'requerido' }),
    );
  }
  if (texto.length > 80) {
    return err(
      new ValidationError('La ocupación es demasiado larga', {
        ocupacion: 'máximo 80 caracteres',
      }),
    );
  }
  return ok({ slot: 'ocupacion', valor: texto });
}

function parseNombre(texto: string): Result<SlotValue, ValidationError> {
  if (texto.length < 2) {
    return err(new ValidationError('El nombre es demasiado corto', { nombre: 'mínimo 2 caracteres' }));
  }
  if (texto.length > 80) {
    return err(new ValidationError('El nombre es demasiado largo', { nombre: 'máximo 80 caracteres' }));
  }
  return ok({ slot: 'nombre', valor: texto });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function parseEmail(texto: string): Result<SlotValue, ValidationError> {
  const normalizado = texto.toLowerCase();
  if (!EMAIL_RE.test(normalizado) || normalizado.length > 120) {
    return err(
      new ValidationError('No se reconoce un correo válido', {
        email: 'se esperaba un email como nombre@dominio.com',
      }),
    );
  }
  return ok({ slot: 'email', valor: normalizado });
}

function parseTelefono(texto: string): Result<SlotValue, ValidationError> {
  let digitos = normalizePhoneDigits(texto);
  // Acepta +57 / 57 delante de un celular de 10 digitos.
  if (digitos.length === 12 && digitos.startsWith('57')) {
    digitos = digitos.slice(2);
  }
  if (digitos.length !== 10 || !digitos.startsWith('3')) {
    return err(
      new ValidationError('No se reconoce un celular colombiano válido', {
        telefono: 'se esperaban 10 dígitos empezando en 3',
      }),
    );
  }
  return ok({ slot: 'telefono', valor: digitos });
}

function parseEdad(texto: string): Result<SlotValue, ValidationError> {
  const digitos = texto.replace(/[^0-9]/gu, '');
  if (digitos.length === 0) {
    return err(new ValidationError('No se reconoce una edad', { edad: 'se esperaba un número' }));
  }
  const valor = Number.parseInt(digitos, 10);
  if (!Number.isSafeInteger(valor) || valor < 18 || valor > 99) {
    return err(
      new ValidationError('La edad no es válida', {
        edad: 'debe estar entre 18 y 99 años',
      }),
    );
  }
  return ok({ slot: 'edad', valor });
}

function parseMonto(
  texto: string,
  campo: 'ahorro' | 'capacidadAhorroMensual',
): Result<SlotValue, ValidationError> {
  // Extrae solo digitos: "$10.000.000" y "10000000" producen el mismo monto.
  // Nunca se escala (multiplica/divide): el COP resultante ya es el peso entero.
  const digitos = texto.replace(/[^0-9]/gu, '');
  if (digitos.length === 0) {
    return err(
      new ValidationError('No se reconoce un monto en la respuesta', {
        [campo]: 'se esperaba un monto en pesos',
      }),
    );
  }
  const valor = Number.parseInt(digitos, 10);
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    return err(
      new ValidationError('El monto no es válido', {
        [campo]: 'debe ser un entero positivo en pesos',
      }),
    );
  }
  return ok({ slot: campo, valor });
}

function parsePersonasACargo(texto: string): Result<SlotValue, ValidationError> {
  const digitos = texto.replace(/[^0-9]/gu, '');
  if (digitos.length === 0) {
    return err(
      new ValidationError('No se reconoce un número de personas a cargo', {
        personasACargo: 'se esperaba un entero',
      }),
    );
  }
  const valor = Number.parseInt(digitos, 10);
  if (!Number.isSafeInteger(valor) || valor < 0) {
    return err(
      new ValidationError('El número de personas a cargo no es válido', {
        personasACargo: 'debe ser un entero no negativo',
      }),
    );
  }
  return ok({ slot: 'personasACargo', valor });
}

/**
 * Parser puro de vocabulario/formato (design.md D1). Determinista: mismo
 * `texto` siempre produce el mismo `Result`. Nunca llama al LLM — eso vive en
 * `application/`.
 */
export function parseAnswer(slot: Slot, texto: string): Result<SlotValue, ValidationError> {
  const normalizado = texto.trim();
  switch (slot) {
    case 'nombre':
      return parseNombre(normalizado);
    case 'email':
      return parseEmail(normalizado);
    case 'telefono':
      return parseTelefono(normalizado);
    case 'edad':
      return parseEdad(normalizado);
    case 'estadoCivil':
      return parseVocabulario(normalizado, ESTADOS_CIVILES, 'estadoCivil', (valor) => ({
        slot: 'estadoCivil',
        valor,
      }));
    case 'ocupacion':
      return parseOcupacion(normalizado);
    case 'afiliacion':
      return parseAfiliacion(normalizado);
    case 'rangoSalarial':
      return parseVocabulario(normalizado, RANGOS_SALARIALES_SMMLV, 'rangoSalarial', (valor) => ({
        slot: 'rangoSalarial',
        valor,
      }));
    case 'segmentoFamiliar':
      return parseVocabulario(normalizado, SEGMENTOS_FAMILIARES, 'segmentoFamiliar', (valor) => ({
        slot: 'segmentoFamiliar',
        valor,
      }));
    case 'segmento':
      return parseVocabulario(normalizado, SEGMENTOS, 'segmento', (valor) => ({
        slot: 'segmento',
        valor,
      }));
    case 'ciudad':
      return parseCiudad(normalizado);
    case 'ahorro':
      return parseMonto(normalizado, 'ahorro');
    case 'capacidadAhorroMensual':
      return parseMonto(normalizado, 'capacidadAhorroMensual');
    case 'personasACargo':
      return parsePersonasACargo(normalizado);
  }
}

function addSlot(slots: readonly Slot[], slot: Slot): Slot[] {
  return slots.includes(slot) ? [...slots] : [...slots, slot];
}

function applyDirectValue(profile: LeadProfile, valor: SlotValue): LeadProfile {
  switch (valor.slot) {
    case 'nombre':
      return { ...profile, nombre: valor.valor };
    case 'email':
      return { ...profile, email: valor.valor };
    case 'telefono':
      return { ...profile, telefono: valor.valor };
    case 'edad':
      return { ...profile, edad: valor.valor };
    case 'estadoCivil':
      return { ...profile, estadoCivil: valor.valor };
    case 'ocupacion':
      return { ...profile, ocupacion: valor.valor };
    case 'afiliacion':
      return { ...profile, esAfiliado: valor.valor };
    case 'rangoSalarial':
      return { ...profile, rangoSalarial: valor.valor };
    case 'ciudad':
      return { ...profile, ciudad: valor.valor };
    case 'segmentoFamiliar':
      return { ...profile, segmentoFamiliar: valor.valor };
    case 'segmento':
      return { ...profile, segmento: valor.valor };
    case 'personasACargo':
      return { ...profile, personasACargo: valor.valor };
    case 'ahorro':
      return { ...profile, ahorroDeclarado: valor.valor };
    case 'capacidadAhorroMensual':
      return { ...profile, capacidadAhorroMensual: valor.valor };
  }
}

/** design.md D8: `rangoSalarial` → `segmento`. `Joven` nunca se infiere. */
function segmentoDesdeDesde(desde: number): Segmento {
  if (desde < 2) {
    return 'Basico';
  }
  if (desde < 6) {
    return 'Medio';
  }
  return 'Alto';
}

function inferirSegmento(profile: LeadProfile, rangoSalarial: string): LeadProfile {
  const cotas = toSmmlvBounds({ etiqueta: rangoSalarial });
  if (!cotas.ok) {
    // No deberia pasar: `rangoSalarial` ya vino validado por `parseAnswer`.
    // Degradamos sin inferir en vez de lanzar, es un dato opcional derivado.
    return profile;
  }
  return {
    ...profile,
    segmento: segmentoDesdeDesde(cotas.value.desde),
    slotsLlenos: addSlot(profile.slotsLlenos, 'segmento'),
  };
}

/**
 * design.md D8: `segmentoFamiliar` → `personasACargo`. Mapeo PLACEHOLDER
 * pendiente de confirmacion con el rol de datos (design.md Open Questions);
 * valores razonables por tipo de nucleo familiar mientras tanto.
 */
const PERSONAS_A_CARGO_POR_SEGMENTO_FAMILIAR: Record<string, number> = {
  Unipersonal: 0,
  'Pareja sin hijos': 0,
  'Pareja con hijos': 2,
  Monoparental: 1,
  'Familia extensa': 3,
};

function inferirPersonasACargo(profile: LeadProfile, segmentoFamiliar: string): LeadProfile {
  const personasACargo = PERSONAS_A_CARGO_POR_SEGMENTO_FAMILIAR[segmentoFamiliar];
  if (personasACargo === undefined) {
    return profile;
  }
  return {
    ...profile,
    personasACargo,
    slotsLlenos: addSlot(profile.slotsLlenos, 'personasACargo'),
  };
}

/**
 * Escribe `valor` en `LeadProfile`, marca el slot como lleno y aplica la
 * tabla de inferencia D8 cuando corresponde. Nunca lanza para un `SlotValue`
 * bien formado: los estados imposibles se modelan por tipos, no por excepciones.
 */
export function updateProfile(
  profile: LeadProfile,
  valor: SlotValue,
  now: IsoDateTime,
): LeadProfile {
  let siguiente = applyDirectValue(profile, valor);
  siguiente = { ...siguiente, slotsLlenos: addSlot(siguiente.slotsLlenos, valor.slot) };

  if (valor.slot === 'rangoSalarial') {
    siguiente = inferirSegmento(siguiente, valor.valor);
  }
  if (valor.slot === 'segmentoFamiliar') {
    siguiente = inferirPersonasACargo(siguiente, valor.valor);
  }

  return { ...siguiente, updatedAt: now };
}

/**
 * `true` cuando los slots preguntados estan llenos — simetrico con
 * `getNextStep(profile) === null`. No depende de `esAfiliado`.
 */
export function isReadyToRoute(profile: LeadProfile): boolean {
  return ASKED_SLOTS.every((slot) => isSlotFilled(profile, slot));
}

/** Progreso 0-1 para `ConversationTurn.progreso` / `ProgressBar`. */
export function computeProgress(profile: LeadProfile): number {
  const completados = ASKED_SLOTS.filter((slot) => isSlotFilled(profile, slot)).length;
  return completados / ASKED_SLOTS.length;
}

/** Constructor generico del mensaje del bot. El texto ya viene decidido por el llamador. */
export function buildBotMessage(input: {
  id: string;
  texto: string;
  quickReplies: QuickReply[];
  now: IsoDateTime;
}): BotMessage {
  return {
    id: input.id,
    texto: input.texto,
    quickReplies: input.quickReplies,
    emisor: 'bot',
    enviadoEn: input.now,
  };
}
