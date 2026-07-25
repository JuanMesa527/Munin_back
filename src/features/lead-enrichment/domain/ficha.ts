/**
 * Campos de la ficha de llamada (F4) que NO salen de los swipes, sino de lo que
 * el titular declaro en F1. Capa: domain (puro, sin I/O).
 *
 * REGLA DE ESTE ARCHIVO: cada funcion deriva su salida de un dato DECLARADO o
 * de un timestamp REAL del lead. Ninguna inventa, ninguna estima "para que la
 * tarjeta no salga vacia". Si el dato no existe, el resultado es `null` o `[]`
 * y la ficha muestra "—": un guion es informacion honesta, un valor plausible
 * inventado es una mentira que el closer va a repetir en voz alta.
 *
 * Antes todos estos campos estaban fijados a `null`/`[]` en `enriquecerConSwipes`,
 * asi que la ficha se veia vacia aunque el chat si hubiera preguntado los datos.
 */

import type {
  ContactabilidadDia,
  DiaContacto,
  EducationJourney,
  LeadProfile,
  LeadTimelineEvent,
  PreferenciaContacto,
} from '@contracts';
import { DIAS_CONTACTO } from '@contracts';
import { toSmmlvBounds } from '@shared/domain/value-objects/salary-range.js';

export type { PreferenciaContacto } from '@contracts';

/**
 * Ingresos en SMMLV, como COTA INFERIOR del rango declarado.
 *
 * El titular declara un tramo (`2-4 SMMLV`), no un numero. Usar el punto medio
 * seria inventar precision que nadie dio — es exactamente el error que tenian
 * los chips de edad, que guardaban 30 para alguien de 27. La cota inferior es
 * verdad verificable y ademas es la direccion conservadora: nunca sobreestima
 * la capacidad del hogar en una conversacion de credito.
 */
export function ingresosEnSmmlv(lead: LeadProfile): number | null {
  if (lead.rangoSalarial === null) {
    return null;
  }
  const cotas = toSmmlvBounds({ etiqueta: lead.rangoSalarial });
  return cotas.ok ? cotas.value.desde : null;
}

/** Timing declarado en F1, en el texto que lee el closer. */
const TEXTO_HORIZONTE: Readonly<Record<string, string>> = {
  ya: 'Quiere comprar ya',
  pronto: 'Compra pronto',
  explorando: 'Todavía explorando',
};

/**
 * `timingCompra` sale del `horizonteCompra` DECLARADO, no de una inferencia
 * sobre los swipes: el titular ya respondio esa pregunta en el chat.
 */
export function timingDeclarado(lead: LeadProfile): string | null {
  if (lead.horizonteCompra === null) {
    return null;
  }
  return TEXTO_HORIZONTE[lead.horizonteCompra] ?? null;
}

/**
 * Fecha lista para mostrar. El contrato dice que el backend formatea porque es
 * quien conoce la zona horaria; el front solo pinta el string.
 */
function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  }).format(fecha);
}

/**
 * Recorrido del lead a partir de sus timestamps REALES.
 *
 * Cada hito sale de un campo que ya existe en el agregado; no hay eventos
 * decorativos. Si un hito no ocurrio, no aparece — la tarjeta con dos hitos es
 * la verdad de ese lead.
 */
export function construirTimeline(
  lead: LeadProfile,
  journey: EducationJourney | null,
): LeadTimelineEvent[] {
  const eventos: LeadTimelineEvent[] = [
    { label: 'Ingresó al perfilador', fecha: formatearFecha(lead.createdAt), hito: 'ingreso' },
  ];

  if (lead.consentimiento?.otorgado === true) {
    eventos.push({
      label: 'Autorizó el tratamiento de datos',
      fecha: formatearFecha(lead.consentimiento.otorgadoEn),
      hito: 'consentimiento',
    });
  }

  // `score.calculadoEn` ES el momento del enrutamiento: `finalize` calcula el
  // score y fija el carril con el mismo `now`.
  if (lead.score !== null) {
    eventos.push({
      label: `Perfilamiento completo · score ${String(lead.score.valor)}/100`,
      fecha: formatearFecha(lead.score.calculadoEn),
      hito: 'perfilamiento',
    });
  }

  if (journey !== null) {
    eventos.push({
      label: `Camino educativo · ${String(Math.round(journey.progreso * 100))}% recorrido`,
      fecha: formatearFecha(journey.actualizadoEn),
      hito: 'nutricion',
    });
  }

  if (lead.carril === 'viable' && lead.score !== null) {
    eventos.push({
      label: 'Clasificado como viable',
      fecha: formatearFecha(lead.score.calculadoEn),
      hito: 'viable',
    });
  }

  return eventos;
}

/**
 * Mapa de contactabilidad a partir de los dias que el titular ELIGIO.
 *
 * Intensidad binaria (100 / 0) a proposito: el contrato la define como
 * "0-100 relativo a la mejor franja del propio lead", y sin historico de
 * llamadas lo unico que sabemos es si el titular marco ese dia o no. Graduar
 * la barra con numeros intermedios simularia una medicion que no existe.
 */
export function construirContactabilidad(
  preferencia: PreferenciaContacto | null,
): ContactabilidadDia[] {
  if (preferencia === null || preferencia.dias.length === 0) {
    return [];
  }
  return DIAS_CONTACTO.map((dia) => ({
    dia,
    intensidad: preferencia.dias.includes(dia) ? 100 : 0,
  }));
}

const NOMBRE_DIA: Readonly<Record<DiaContacto, string>> = {
  L: 'lunes',
  M: 'martes',
  X: 'miércoles',
  J: 'jueves',
  V: 'viernes',
  S: 'sábado',
};

/** Etiqueta de la franja preferida, tal como la eligio el titular. */
export function mejorHorarioDeclarado(preferencia: PreferenciaContacto | null): string | null {
  if (preferencia === null || preferencia.franjas.length === 0) {
    return null;
  }
  return preferencia.franjas.join(' y ');
}

/**
 * El "por que" del horario. El contrato lo exige: "sin el, el dato no es
 * accionable". Aqui el porque es simple y verdadero — lo pidio el titular.
 */
export function razonDelHorario(preferencia: PreferenciaContacto | null): string | null {
  if (preferencia === null || preferencia.dias.length === 0) {
    return null;
  }
  const dias = preferencia.dias.map((dia) => NOMBRE_DIA[dia]).join(', ');
  return `Lo pidió el titular al cerrar su perfil: ${dias}.`;
}
