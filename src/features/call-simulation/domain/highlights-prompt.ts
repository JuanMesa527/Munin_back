/**
 * Prompt del analista de la llamada. Capa: domain (funciones puras).
 *
 * Vive aqui y no en el adapter por la misma razon que `persona.ts`: es la
 * pieza que decide QUE ve el modelo, y eso hay que poder testearlo sin red.
 *
 * SIN PII: se le pasa el mismo `PersonaContext` recortado del roleplay (solo
 * primer nombre) mas la transcripcion, que es voz del comercial y replicas
 * sinteticas. Nunca telefono, apellidos ni documento.
 */

import type { CallHighlightTipo, CallScorecard, CallTurn, PersonaContext } from '@contracts';

/** Tope por analisis: mas de esto no se lee, y cada item cuesta tokens. */
export const MAXIMO_HIGHLIGHTS = 8;

/**
 * Las cuatro familias que el closer pidio, desdobladas en los seis tipos del
 * contrato. El texto describe QUE buscar, no como redactarlo.
 */
const CATALOGO_TIPOS: Record<CallHighlightTipo, string> = {
  momento_clave:
    'el turno donde el interes del lead dio el mayor salto hacia arriba, y que dijo el closer ' +
    'para provocarlo',
  momento_perdido:
    'el turno donde la conversacion se estanco o el interes cayo, y por que',
  acierto: 'la frase del closer que mejor funciono, citada TEXTUAL',
  error:
    'el error mas costoso del closer, con la alternativa CONCRETA que debio decir en ese momento',
  objecion_sin_resolver:
    'lo que el lead pidio y nunca recibio; incluye peticiones que el lead haya hecho aunque no ' +
    'estuvieran en su lista de objeciones (p. ej. pedir la cuota mensual)',
  cumplimiento:
    'promesas indebidas del closer ("esta aprobado", "garantizado", "seguro le sale") con el ' +
    'turno exacto; en Colombia ni el credito ni el subsidio se pueden prometer aprobados',
};

/** La transcripcion numerada. El indice es lo que el modelo debe citar. */
export function formatearTranscripcion(turnos: readonly CallTurn[]): string {
  return turnos
    .map((turno) => {
      const lineas: string[] = [];
      if (turno.closerDijo.trim().length > 0) {
        lineas.push(`[turno ${String(turno.indice)}] CLOSER: ${turno.closerDijo}`);
      }
      lineas.push(
        `[turno ${String(turno.indice)}] LEAD (interes ${String(turno.interes)}): ${turno.leadRespondio}`,
      );
      return lineas.join('\n');
    })
    .join('\n');
}

/**
 * System prompt del analista.
 *
 * Se le entregan los hechos YA calculados (puntaje, factores, objeciones vivas,
 * alertas) y se le prohibe explicitamente recalcularlos: si el modelo discrepa
 * del veredicto, el que manda es el veredicto.
 */
export function buildHighlightsPrompt(
  persona: PersonaContext,
  scorecard: CallScorecard,
): string {
  const tipos = Object.entries(CATALOGO_TIPOS)
    .map(([tipo, que]) => `  - "${tipo}": ${que}`)
    .join('\n');

  const hechos = [
    `Resultado: ${scorecard.outcome}. Puntaje del closer: ${String(scorecard.puntaje)}/100.`,
    `Interes final del lead: ${String(scorecard.interesFinal)}/100.`,
    `Guion: uso ${String(scorecard.talkingPointsUsados.length)} puntos e ignoro ` +
      `${String(scorecard.talkingPointsIgnorados.length)}.`,
    scorecard.objecionesVivas.length > 0
      ? `Objeciones que quedaron VIVAS: ${scorecard.objecionesVivas.map((o) => `"${o}"`).join(', ')}.`
      : 'No quedaron objeciones del guion sin resolver.',
    scorecard.alertas.length > 0
      ? `Alertas de cumplimiento detectadas: ${scorecard.alertas.join(' | ')}.`
      : 'No se detectaron promesas indebidas.',
  ].join('\n');

  return [
    'Eres un coach de ventas que analiza una llamada de entrenamiento ya terminada. Le hablas ' +
      'AL CLOSER, en segunda persona ("dijiste", "te falto"), directo y sin rodeos.',

    `El lead simulado era ${persona.primerNombre}.`,

    'HECHOS YA CALCULADOS por el sistema (no los recalcules, no los contradigas, no inventes ' +
      `otros numeros):\n${hechos}`,

    `Devuelve como maximo ${String(MAXIMO_HIGHLIGHTS)} hallazgos. Tipos permitidos:\n${tipos}`,

    'No fuerces los seis tipos: si en la llamada no hubo un error grave o no hubo promesas ' +
      'indebidas, NO inventes uno. Es preferible un analisis corto y cierto que uno completo y ' +
      'relleno.',

    'Cada hallazgo con cita debe citar TEXTUALMENTE una frase que este en la transcripcion, ' +
      'copiada tal cual, y el numero de turno donde aparece. Nunca parafrasees una cita.',

    'Responde EXCLUSIVAMENTE un JSON con la forma {"resumen": string, "items": [{"tipo": uno de ' +
      'los tipos listados, "titulo": string corto, "detalle": string de 1-3 frases, "turno": ' +
      'numero o null, "cita": string o null, "sugerencia": string o null}]}. ' +
      '"sugerencia" solo en los tipos "error" y "objecion_sin_resolver": que decir la proxima vez.',

    'El "resumen" son 2-3 frases para el closer: que hizo bien y que es lo UNO que deberia ' +
      'cambiar en su proxima llamada.',

    'Escribe en espanol de Colombia, sin anglicismos y sin texto fuera del JSON.',
  ].join('\n\n');
}
