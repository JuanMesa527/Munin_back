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
      id: 'cont-financiar-marco-2026',
      etapa: 'financiar',
      titulo: 'Marco financiero 2026',
      cuerpo:
        'En 2026 el salario mínimo (SMMLV) es de $1.750.905, y de él se derivan los topes de precio para acceder a subsidio de vivienda. Una VIP no supera los 90 SMMLV ($157.581.450), una VIS regional los 135 SMMLV ($236.372.175), y una VIS metropolitana los 150 SMMLV ($262.635.750). Este último tope aplica en Bogotá y en los municipios del Decreto 1607 de 2022: Tabio, Cajicá, Chía, Cota, Facatativá, Funza, La Calera, Madrid, Mosquera, Sibaté, Soacha, Tocancipá y Zipaquirá. Saber en qué tope cae la vivienda que te interesa es el primer paso antes de calcular cualquier subsidio.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-requisitos-generales',
      etapa: 'financiar',
      titulo: 'Requisitos generales del subsidio',
      cuerpo:
        'Para postular necesitás afiliación activa a la caja: si sos dependiente, que tu empresa esté afiliada y a paz y salvo; si sos pensionado o independiente, haber aportado el 2% de tu mesada o ingresos durante mínimo 6 meses continuos antes de postular. El ingreso de tu hogar no puede superar los 4 SMMLV ($7.003.620) para la mayoría de modalidades, o 2 SMMLV ($3.501.810) si es para arrendamiento. Ningún integrante del hogar puede ser propietario ni poseedor de vivienda en el país, salvo que el subsidio sea para mejorar o construir en un lote propio. Tampoco podés haber recibido antes un subsidio de vivienda nacional o de otra caja — aunque haber tenido subsidio de arrendamiento no te inhabilita para pedir el de vivienda nueva.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-que-es-sfv',
      etapa: 'financiar',
      titulo: '¿Qué es el Subsidio Familiar de Vivienda?',
      cuerpo:
        'El SFV es un aporte no reembolsable que entrega tu caja de compensación para completar la cuota inicial de tu vivienda: no es un préstamo, no se devuelve, y se suma a tu ahorro y tu crédito. Existen varias modalidades según lo que necesitás — comprar vivienda nueva o usada, arrendar, construir en tu propio lote o mejorar la que ya tenés — cada una con su propio monto y requisitos, que vas a ver en detalle a continuación. Acá lo calculamos siempre como estimado, nunca como aprobado: la caja confirma el otorgamiento final.',
      tipoContenido: 'concepto',
      videoId: '7Xrc7veLOQc',
    },
    {
      id: 'cont-financiar-modalidad-vivienda-nueva',
      etapa: 'financiar',
      titulo: 'Adquisición de vivienda nueva',
      cuerpo:
        'Si el ingreso de tu hogar es de hasta 2 SMMLV ($3.501.810), el subsidio estimado para la cuota inicial de una vivienda VIS o VIP nueva es de 30 SMMLV, es decir $52.527.150. Si ganás más de 2 y hasta 4 SMMLV (entre $3.501.811 y $7.003.620), el subsidio estimado baja a 20 SMMLV, $35.018.100. En ambos casos el monto se suma a tu ahorro y a tu crédito hipotecario para cubrir la cuota inicial completa.',
      tipoContenido: 'concepto',
      videoId: 'mUJWzzHCakQ',
    },
    {
      id: 'cont-financiar-modalidad-usada',
      etapa: 'financiar',
      titulo: 'Adquisición de vivienda usada',
      cuerpo:
        'Esta modalidad no es para cualquier hogar: aplica solo si sos madre comunitaria o sustituta del ICBF, reciclador certificado, concejal de un municipio de categoría 4, 5 o 6, o perteneces a población desplazada o víctima de un desastre natural. El inmueble también tiene condiciones: debe estar en zona urbana, en un barrio legalizado, con servicios públicos, y libre de gravámenes o embargos. Si no encajás en estos perfiles, la vivienda nueva sigue siendo tu camino más directo.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-modalidad-arrendamiento',
      etapa: 'financiar',
      titulo: 'Subsidio de arrendamiento',
      cuerpo:
        'Este subsidio cubre hasta 0.6 SMMLV al mes ($1.050.543) y nunca más del 90% del canon pactado, por un plazo de entre 12 y 24 meses. El canon del inmueble también tiene tope: $2.626.357 en Bogotá y los municipios del Decreto 1607, y $2.363.722 en el resto de Cundinamarca. No es un beneficio aislado: para acceder necesitás estar vinculado a la compra de una VIS nueva y haber hecho al menos 6 pagos mensuales de tu cuota inicial antes de postular.',
      tipoContenido: 'concepto',
      videoId: 'MgscsvfdjEw',
    },
    {
      id: 'cont-financiar-modalidad-construccion-mejoramiento',
      etapa: 'financiar',
      titulo: 'Construcción y mejoramiento de vivienda',
      cuerpo:
        'Si tenés lote propio, la construcción en sitio propio te da un subsidio estimado de hasta 18 SMMLV en zona urbana ($31.516.290) o hasta 70 SMMLV en zona rural ($122.563.350), siempre que el lote sea tuyo o de un integrante del hogar, tenga servicios públicos inmediatos y licencia de construcción — la solución de vivienda completa no puede superar 135 SMMLV. Si en cambio ya tenés vivienda y necesitás arreglarla, el subsidio de mejoramiento cubre baños, cocinas, pisos, techos o redes eléctricas e hidráulicas, hasta 18 SMMLV urbano ($31.516.290) o 22 SMMLV rural ($38.519.910). Para mejoramiento, el avalúo catastral no puede superar 135 SMMLV en zona urbana o 70 SMMLV en zona rural, y la vivienda no puede estar en zona de riesgo ni requerir una renovación total.',
      tipoContenido: 'concepto',
    },
    {
      id: 'cont-financiar-credito',
      etapa: 'financiar',
      titulo: '¿Qué es un crédito hipotecario?',
      cuerpo:
        'Es un préstamo a largo plazo (típicamente 15-20 años) respaldado por la vivienda que comprás: si dejás de pagar, el banco puede recuperarla. Es la forma más común de financiar vivienda en Colombia, y se combina con tu ahorro y el subsidio estimado.',
      tipoContenido: 'concepto',
      videoId: 'daCes3ud6QQ',
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
      id: 'cont-financiar-proceso-postulacion',
      etapa: 'financiar',
      titulo: 'Cómo postular al subsidio',
      cuerpo:
        'Postular tiene cinco pasos: primero identificás la modalidad que te aplica y verificás tu ingreso y antigüedad de afiliación; luego reunís tus documentos en PDF, sin clave ni encriptación. El canal depende de la modalidad: vivienda nueva y arrendamiento se postulan por el Portal Transaccional (transacciones.colsubsidio.com) o en un centro presencial; construcción y mejoramiento, por correo a gerencia.proyectos@colsubsidio.com. Colsubsidio tiene 15 días hábiles para darte el resultado de la validación documental, y si tu radicación queda aprobada, pasa a "verificación de derechos" para asignarse según el calendario vigente. Colsubsidio se reserva el derecho de verificar la veracidad de la información en cualquier etapa, incluso después del desembolso.',
      tipoContenido: 'concepto',
      videoId: 'K9nbx4QZlGs',
    },
    {
      id: 'cont-financiar-calendario-vigencia',
      etapa: 'financiar',
      titulo: 'Fechas clave y vigencia 2026',
      cuerpo:
        'Las postulaciones con los valores 2026 están abiertas desde el 21 de enero de 2026. El cierre para vivienda nueva y arrendamiento es el 17 de noviembre de 2026; para construcción y mejoramiento, el 15 de diciembre de 2026. Una vez asignado, el subsidio dura 36 meses, y podés pedir una única prórroga de 24 meses más (60 meses en total) si demostrás que el proceso de compra o construcción ya está avanzado, por ejemplo con una promesa de compraventa o la escritura en trámite. La escritura pública tiene que firmarse mientras el subsidio siga vigente: si se vence antes, el beneficio se pierde.',
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
