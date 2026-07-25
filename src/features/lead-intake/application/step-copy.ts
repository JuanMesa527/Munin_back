/**
 * Copy de las preguntas de F1 (lead-intake). Capa: application.
 *
 * DUPLICADO INTENCIONAL Y DOCUMENTADO: `domain/conversation.ts` (Fase 1, ya
 * comiteado) calcula este mismo texto en su `copyFor` privado, pero
 * `ConversationStep` (contracts.ts) no tiene un campo `texto` — domain solo
 * expone `quickReplies` en el paso. Esta fase no puede modificar archivos ya
 * comiteados de la Fase 1 (disciplina de PRs apiladas), asi que este mapa
 * espeja el copy EXACTO confirmado por el product owner para que
 * `BotMessage.texto` no invente redaccion propia. Seguimiento sugerido para
 * una fase futura: exportar el texto desde `domain/conversation.ts` (p. ej.
 * un `getStepPrompt(slot)`) y eliminar esta duplicacion.
 */

import type { Slot } from '@contracts';

const STEP_PROMPT_BY_SLOT: Partial<Record<Slot, string>> = {
  nombre: 'Para empezar, ¿cómo te llamas?',
  email: '¿Cuál es tu correo electrónico?',
  telefono: '¿A qué número de celular te podemos contactar?',
  edad: '¿Cuántos años tienes?',
  estadoCivil: '¿Cuál es tu estado civil?',
  ocupacion: '¿A qué te dedicas?',
  afiliacion: '¿Estás afiliado a Colsubsidio?',
  viviendaPropia: '¿Ya tienes vivienda propia?',
  rangoSalarial: '¿En qué rango están tus ingresos mensuales?',
  vinculacionLaboral: '¿Cómo son tus ingresos hoy?',
  segmentoFamiliar: '¿Cómo es tu núcleo familiar?',
  ciudad: '¿En qué ciudad buscás vivienda?',
  ahorro: '¿Cuánto tenés ahorrado hoy para tu vivienda?',
  capacidadAhorroMensual: '¿Cuánto podrías ahorrar por mes?',
  horizonteCompra: '¿Para cuándo estás buscando tu vivienda?',
};

const TEXTO_GENERICO = 'Continuemos con tu perfil. Cuéntame lo que falte con tus palabras o elige una opción.';

/**
 * `null` cubre el caso defensivo en el que no hay un paso de pregunta activo
 * (nunca deberia pasar en el flujo normal: se degrada a un texto generico en
 * vez de lanzar, igual que el resto del dominio ante datos inesperados).
 */
export function stepPromptFor(slot: Slot | null): string {
  if (slot === null) {
    return TEXTO_GENERICO;
  }
  return STEP_PROMPT_BY_SLOT[slot] ?? TEXTO_GENERICO;
}
