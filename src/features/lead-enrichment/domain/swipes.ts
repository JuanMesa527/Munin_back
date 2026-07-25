/**
 * Que le hace un swipe al perfil del lead. Capa: domain (funciones puras).
 *
 * La idea de F2.1: el gesto ES la captura de preferencias. En vez de un
 * formulario que pregunta "que amenidades te importan", el usuario mira
 * proyectos y decide; de esas decisiones salen `intereses`, `zonaPreferida` y
 * el `intentScore`. Menos friccion y una senal mas honesta que la declarada.
 *
 * GLASS-BOX (regla 20): esto es aritmetica sobre los swipes. El LLM no puntua.
 */

import type {
  EnrichedLead,
  LeadProfile,
  ProjectCard,
  SwipeAction,
  SwipeEvent,
  Zona,
} from '@contracts';

/**
 * Cuanto vale cada gesto al estimar intencion.
 *
 * `pass` vale 0 y no negativo a proposito: descartar proyectos es parte sana de
 * elegir. Quien descarta 10 y guarda 2 esta MAS decidido que quien no toca
 * nada, y un peso negativo diria lo contrario.
 */
const VALOR_INTENCION: Record<SwipeAction, number> = {
  pass: 0,
  like: 1,
  favorito: 2.5,
};

/** Swipes a partir de los cuales la senal se considera suficiente. */
const SWIPES_PARA_SENAL_COMPLETA = 8;

/**
 * Peso de cada componente del `intentScore` (0-100). Suman 100.
 *
 * `foco` pesa igual que `interes` a proposito. Con `interes` dominando, quien
 * le daba like a TODO puntuaba mas alto que quien elegia dos proyectos entre
 * doce -- justo al reves de lo que el score debe decir, porque el segundo le
 * sirve al closer y el primero no. El test
 * "darle like a todo puntea menos que ser selectivo" fija esa propiedad.
 */
const PESO_DECISION = 40;
const PESO_INTERES = 30;
const PESO_FOCO = 30;

/** Amenidades que se promueven a `intereses` cuando el usuario guarda proyectos. */
const INTERESES_RASTREABLES: readonly { etiqueta: string; patrones: readonly string[] }[] = [
  { etiqueta: 'Gimnasio', patrones: ['gimnasio', 'ecogym'] },
  { etiqueta: 'Coworking', patrones: ['coworking', 'social living', 'sala de juntas'] },
  { etiqueta: 'Zonas para ninos', patrones: ['infantil', 'para ninos'] },
  { etiqueta: 'Mascotas', patrones: ['mascota', 'zona pet'] },
  { etiqueta: 'Piscina', patrones: ['piscina'] },
  { etiqueta: 'Deporte', patrones: ['cancha', 'trote', 'biosaludable', 'yoga'] },
  { etiqueta: 'Zonas verdes', patrones: ['zonas verdes', 'sendero', 'parque'] },
  { etiqueta: 'Asado y terraza', patrones: ['bbq', 'terraza'] },
  { etiqueta: 'Movilidad en bici', patrones: ['biciclet'] },
  { etiqueta: 'Sostenibilidad', patrones: ['edge'] },
];

/** Un swipe con la ficha que le corresponde, ya resuelta. */
export interface SwipeResuelto {
  evento: SwipeEvent;
  ficha: ProjectCard;
}

/** Solo los gestos que expresan interes. `pass` no dice que le gusta a nadie. */
function guardados(swipes: readonly SwipeResuelto[]): SwipeResuelto[] {
  return swipes.filter((swipe) => swipe.evento.accion !== 'pass');
}

/**
 * Tope de intereses que se publican. Nueve etiquetas no son un perfil: son una
 * lista que el closer no va a leer y que no distingue a este lead de ningun
 * otro. Cinco alcanzan para abrir una conversacion.
 */
const MAX_INTERESES = 5;

/**
 * Intereses inferidos de las amenidades de los proyectos que el usuario guardo.
 *
 * Una amenidad cuenta como interes cuando aparece en al menos la mitad de lo
 * guardado Y en dos proyectos distintos: si guardo 4 y 3 tienen gimnasio, el
 * gimnasio le importa; si solo 1 lo tiene, es ruido de ese proyecto y no una
 * preferencia suya. Con un unico guardado no hay repeticion posible, asi que
 * ahi si vale con una aparicion.
 */
export function inferirIntereses(swipes: readonly SwipeResuelto[]): string[] {
  const positivos = guardados(swipes);
  if (positivos.length === 0) {
    return [];
  }

  const minimo = positivos.length === 1 ? 1 : Math.max(2, Math.ceil(positivos.length / 2));

  return (
    INTERESES_RASTREABLES.map(({ etiqueta, patrones }) => {
      const cuantos = positivos.filter((swipe) => {
        const texto = [...swipe.ficha.amenidades, swipe.ficha.certificacionEdge ? 'EDGE' : '']
          .join(' | ')
          .toLowerCase();
        return patrones.some((patron) => texto.includes(patron));
      }).length;
      return { etiqueta, cuantos };
    })
      .filter(({ cuantos }) => cuantos >= minimo)
      // Los que mas se repiten primero: son los que mejor describen al lead.
      .sort((a, b) => b.cuantos - a.cuantos)
      .slice(0, MAX_INTERESES)
      .map(({ etiqueta }) => etiqueta)
  );
}

/**
 * Zona preferida: la mas repetida entre lo guardado, con `favorito` valiendo
 * doble. Devuelve `null` si no hay senal, en vez de inventar una zona.
 */
export function inferirZonaPreferida(swipes: readonly SwipeResuelto[]): Zona | null {
  const conteo = new Map<Zona, number>();

  for (const swipe of guardados(swipes)) {
    const peso = swipe.evento.accion === 'favorito' ? 2 : 1;
    const zona = swipe.ficha.zona;
    conteo.set(zona, (conteo.get(zona) ?? 0) + peso);
  }

  let ganadora: Zona | null = null;
  let mejor = 0;
  for (const [zona, puntos] of conteo) {
    if (puntos > mejor) {
      mejor = puntos;
      ganadora = zona;
    }
  }
  return ganadora;
}

/**
 * Intencion de compra 0-100, deterministica. Tres senales:
 *
 *   decision — cuantas tarjetas miro. Recorrer la baraja completa es intencion;
 *              abandonar en la segunda no lo es.
 *   interes  — cuanto peso acumulo en likes y favoritos.
 *   foco     — que tan selectivo fue. Guardar 2 de 12 es un comprador con
 *              criterio; darle like a todo no distingue nada y no informa al
 *              closer, asi que puntea bajo.
 */
export function calcularIntentScore(swipes: readonly SwipeResuelto[]): number {
  if (swipes.length === 0) {
    return 0;
  }

  const decision = Math.min(1, swipes.length / SWIPES_PARA_SENAL_COMPLETA);

  const pesoTotal = swipes.reduce((suma, swipe) => suma + VALOR_INTENCION[swipe.evento.accion], 0);
  const interes = Math.min(1, pesoTotal / (SWIPES_PARA_SENAL_COMPLETA * VALOR_INTENCION.like));

  const positivos = guardados(swipes).length;
  const proporcion = positivos / swipes.length;
  // Campana centrada en ~1/3 de aprobacion: ni indiferente ni indiscriminado.
  const foco = positivos === 0 ? 0 : Math.max(0, 1 - Math.abs(proporcion - 0.34) / 0.5);

  const total = decision * PESO_DECISION + interes * PESO_INTERES + foco * PESO_FOCO;
  return Math.round(Math.min(100, total));
}

/** Fichas guardadas, favoritos primero y en el orden en que las decidio. */
export function fichasGuardadas(swipes: readonly SwipeResuelto[]): ProjectCard[] {
  const positivos = guardados(swipes);
  const favoritos = positivos.filter((swipe) => swipe.evento.accion === 'favorito');
  const likes = positivos.filter((swipe) => swipe.evento.accion === 'like');
  return [...favoritos, ...likes].map((swipe) => swipe.ficha);
}

/**
 * Aplica los swipes sobre el perfil y devuelve el lead enriquecido.
 *
 * No toca `identidad` ni `contacto`: esos los captura el paso de contacto de
 * F2.1, y meterlos aqui mezclaria inferencia con datos declarados.
 */
export function enriquecerConSwipes(
  lead: LeadProfile,
  swipes: readonly SwipeResuelto[],
  ahora: string,
): EnrichedLead {
  const zona = inferirZonaPreferida(swipes);

  return {
    ...lead,
    identidad: lead.identidad,
    intereses: inferirIntereses(swipes),
    zonaPreferida: zona,
    timingCompra: null,
    motivacion: null,
    contacto: null,
    intentScore: calcularIntentScore(swipes),
    enriquecidoEn: ahora,
    edad: null,
    ocupacion: null,
    hogar:
      lead.segmentoFamiliar ??
      (lead.personasACargo === null ? null : `${String(lead.personasACargo)} personas a cargo`),
    ingresosSmmlv: null,
    subsidioEstimado: null,
    citaTextual: null,
    contactabilidad: [],
    horarioRazon: null,
    timeline: [],
    updatedAt: ahora,
  };
}
