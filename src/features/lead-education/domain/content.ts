/**
 * Contenido educativo CURADO del "Camino a Mi Hogar". Capa: domain (puro).
 *
 * Determinista a proposito (decision del equipo): los textos estan escritos a
 * mano, no los genera un LLM en vivo. Asi la demo es autogestionada y a prueba
 * de jurado — no depende de red ni de una API key. El tono es siempre
 * "todavía no, pero acá está tu camino", nunca "no calificás".
 *
 * LEGAL: hablamos de subsidio y capacidad SIEMPRE como ESTIMADO, nunca como
 * aprobado (Ley 1266 de 2008: no consultamos centrales de riesgo).
 */

import type { ContenidoEducativo, EtapaId, IsoDateTime } from '@contracts';

const CATALOGO: Readonly<Record<EtapaId, readonly ContenidoEducativo[]>> = {
  descubrir: [
    {
      id: 'cont-descubrir-comprar-vs-arrendar',
      etapa: 'descubrir',
      titulo: 'Comprar vs. arrendar',
      cuerpo:
        'Arrendar es de otro; la cuota de un crédito construye tu patrimonio. La pregunta no es "¿puedo?", sino "¿por dónde empiezo?". Este camino te lo muestra.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-descubrir-que-es-vis',
      etapa: 'descubrir',
      titulo: '¿Qué es una vivienda VIS?',
      cuerpo:
        'La Vivienda de Interés Social tiene precio topado por ley y acceso preferente a subsidios. Es la puerta de entrada más común a la vivienda propia.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-descubrir-senales-listo',
      etapa: 'descubrir',
      titulo: '¿Cuándo estoy listo para empezar?',
      cuerpo:
        'No necesitás el 100% ahorrado para arrancar: alcanza con un ingreso estable y algo de ahorro, aunque sea pequeño. El resto (subsidio, crédito, tiempo) lo va armando el camino con vos.',
      tipoContenido: 'concepto',
    },
  ],
  capacidad: [
    {
      id: 'cont-capacidad-cuota-inicial',
      etapa: 'capacidad',
      titulo: 'Tu cuota inicial',
      cuerpo:
        'La cuota inicial suele ser el 20-30% del valor. Tu ahorro y el subsidio estimado suman para cubrirla: por eso ahorrar mueve tu meta más rápido de lo que crees.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-capacidad-endeudamiento',
      etapa: 'capacidad',
      titulo: 'Cuánto crédito podés pagar',
      cuerpo:
        'Los bancos usan una regla práctica: la cuota mensual no debería superar el 30% de tu ingreso neto familiar. Si ganás $3.000.000, tu cuota estimada cómoda ronda los $900.000 — eso, no el precio de la vivienda, define cuánto podés pedir prestado.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-capacidad-simulacion',
      etapa: 'capacidad',
      titulo: 'Simulá tu ahorro',
      cuerpo:
        'Con lo que declaraste, cada mes de ahorro te acerca a cerrar la brecha. El plan te muestra cuántos meses faltan: es un estimado, y baja si aumentás el aporte.',
      tipoContenido: 'simulacion',
    },
  ],
  financiar: [
    {
      id: 'cont-financiar-credito',
      etapa: 'financiar',
      titulo: '¿Qué es un crédito hipotecario?',
      cuerpo:
        'Es un préstamo a largo plazo (típicamente 15-20 años) respaldado por la vivienda que comprás: si dejás de pagar, el banco puede recuperarla. Es la forma más común de financiar vivienda en Colombia, y se combina con tu ahorro y el subsidio estimado.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-que-es-sfv',
      etapa: 'financiar',
      titulo: '¿Qué es el Subsidio Familiar de Vivienda?',
      cuerpo:
        'El SFV es un aporte no reembolsable de la caja de compensación para hogares con ingresos de hasta 4 SMMLV: hasta 30 SMMLV si ganás menos de 2 SMMLV, hasta 20 SMMLV si ganás entre 2 y 4. Complementa tu ahorro y tu crédito. Acá lo calculamos como estimado, no como aprobado.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-credito-vs-leasing',
      etapa: 'financiar',
      titulo: 'Crédito hipotecario y leasing',
      cuerpo:
        'Son dos formas de financiar: en el crédito la vivienda es tuya desde el inicio; en el leasing habitacional la habitás y la compras al final del contrato, ejerciendo una opción de compra. La aprobación y las condiciones siempre las define la entidad financiera.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-alternativas',
      etapa: 'financiar',
      titulo: 'Alternativas de financiamiento',
      cuerpo:
        'Además del crédito bancario tradicional existen cooperativas y fondos de empleados (suelen tener tasas más flexibles), el ahorro programado en tu caja de compensación, y tus cesantías, que podés destinar directamente a la compra de vivienda.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-tasa-fija-variable',
      etapa: 'financiar',
      titulo: 'Tasa fija vs. variable',
      cuerpo:
        'Con tasa fija tu cuota no cambia durante todo el crédito: previsibilidad total. Con tasa variable (indexada a la UVR) la cuota puede subir o bajar con la inflación, arrancando más baja pero con menos certeza a largo plazo. A mayor plazo del crédito, más pesa esa diferencia.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-cuota-vs-ingreso',
      etapa: 'financiar',
      titulo: 'Cuota vs. ingreso',
      cuerpo:
        'La regla del 30% no es un capricho del banco: es lo que te deja margen para vivir sin ahogarte cada mes. Antes de fijar el precio objetivo de tu vivienda, calculá primero cuánto podés pagar cómodo — el precio se ajusta a tu cuota, no al revés.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-plan',
      etapa: 'financiar',
      titulo: 'Armá tu plan de financiamiento',
      cuerpo:
        'Tu plan es la suma de tres piezas: lo que ya ahorraste, el subsidio estimado que te corresponde, y el crédito que cubre el resto. Ver los tres números juntos es lo que convierte "quiero comprar" en una meta con fecha.',
      tipoContenido: 'concepto',
    },
  ],
  prepararse: [
    {
      id: 'cont-prepararse-checklist-documentos',
      etapa: 'prepararse',
      titulo: 'Tus documentos, listos',
      cuerpo:
        'Cédula, certificado laboral o de ingresos, extractos bancarios de los últimos 3-6 meses, declaración de renta (si aplica) y tu historia de ahorro programado. Tenerlos a mano acelera todo cuando hables con el asesor.',
      tipoContenido: 'checklist',
    },
    {
      id: 'cont-prepararse-avaluo-estudio-titulo',
      etapa: 'prepararse',
      titulo: 'Avalúo y estudio de título',
      cuerpo:
        'Antes de firmar, el banco pide un avalúo (confirma que el precio es justo) y un estudio de título (confirma que el inmueble no tiene deudas ni líos legales pendientes). Son pasos normales del proceso, no un obstáculo.',
      tipoContenido: 'concepto',
    },
  ],
  llegar: [
    {
      id: 'cont-llegar-que-esperar-asesor',
      etapa: 'llegar',
      titulo: 'Qué esperar del asesor',
      cuerpo:
        'Llegás informado: sabés tu capacidad estimada, tu subsidio estimado y qué proyecto te encaja. El asesor te ayuda a concretar, no a empezar de cero.',
      tipoContenido: 'concepto',
    },
  ],
};

/** Devuelve el microlearning curado de una etapa del camino. */
export function buildEducationalContent(etapa: EtapaId): ContenidoEducativo[] {
  return [...CATALOGO[etapa]];
}

/**
 * Seguimiento programado. MOCK a proposito: no dispara mensajeria real
 * (WhatsApp/SMS/email) porque eso exige consentimiento para esa finalidad
 * especifica y esta fuera de alcance del reto. Solo deja constancia deterministica.
 */
export interface FollowUp {
  leadId: string;
  programadoPara: IsoDateTime;
  canal: 'mock';
  nota: string;
}

export function scheduleFollowUp(leadId: string, programadoPara: IsoDateTime): FollowUp {
  return {
    leadId,
    programadoPara,
    canal: 'mock',
    nota: 'Seguimiento simulado: la demo no envía mensajería real.',
  };
}
