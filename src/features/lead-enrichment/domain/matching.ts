/**
 * Matching lead <-> proyecto. Capa: domain (funciones puras, cero I/O).
 *
 * GLASS-BOX (reglas 20 y 21): esto es una funcion determinista con pesos
 * declarados arriba. Ningun LLM participa. Cada tarjeta sale con la lista de
 * factores que la puso donde esta, y `razon` se arma con esos mismos factores,
 * no con una redaccion libre que podria contradecirlos.
 *
 * ## De donde salen los pesos
 *
 * `data/project_profiles.json` (el buyer persona real de los 4.142 compradores)
 * TODAVIA es un placeholder, asi que hoy no se puede comparar al lead contra la
 * distribucion de quienes si compraron. Mientras tanto el matching corre contra
 * la ficha comercial del brochure, que si es real.
 *
 * Los pesos de abajo estan puestos por criterio de negocio, no calibrados:
 *   - la capacidad pesa mas que todo lo demas junto, porque un proyecto que el
 *     lead no puede pagar es ruido sin importar cuanto le guste;
 *   - la ubicacion sigue, porque es el segundo motivo real de descarte;
 *   - el resto ajusta el orden dentro de lo ya viable.
 *
 * CUANDO CORRA EL PIPELINE: reemplazar `PESOS` por los de `weights.json` y
 * agregar el factor de similitud contra `perfilComprador`. Ese cambio va
 * documentado con su porque, igual que este (regla 23).
 */

import type {
  CapacityBand,
  Factor,
  LeadProfile,
  ProjectCard,
  ProjectMatch,
  ProjectMatchCard,
} from '@contracts';
import { TOPE_SFV_SMMLV } from '@contracts';

/**
 * Peso de cada factor sobre el puntaje de afinidad. Suman 1.0: asi la similitud
 * final vive en 0..1 sin normalizacion extra y `contribucion` se lee como
 * "cuantos puntos de los 100 aporto este factor".
 */
const PESOS = {
  capacidad: 0.4,
  ubicacion: 0.25,
  tamanoHogar: 0.15,
  vivienda: 0.12,
  estiloDeVida: 0.08,
} as const;

/** Rangos salariales que caen bajo el tope del SFV (<= 4 SMMLV). */
const RANGOS_BAJO_TOPE_SFV: readonly string[] = ['0-2 SMMLV', '2-4 SMMLV'];

/** Amenidades que hacen a un proyecto atractivo para un hogar con ninos. */
const AMENIDADES_FAMILIARES: readonly string[] = [
  'parque infantil',
  'juegos infantiles',
  'salon para ninos',
  'cancha multiple',
  'piscina',
];

/** Amenidades del perfil joven / primer hogar. */
const AMENIDADES_JOVENES: readonly string[] = [
  'coworking',
  'gimnasio',
  'social living',
  'salon de juegos',
  'bicicleteros',
];

/**
 * Un puntaje parcial de un factor, antes de convertirse en `Factor`.
 *
 * `favorable` esta separado de `ajuste` a proposito. Un proyecto 2% por encima
 * del techo del lead punta casi igual que uno que cabe -- y esta bien que asi
 * sea, porque sigue siendo conversable -- pero "por encima de tu techo" NO es
 * un motivo para mostrarlo. Sin esta separacion, la tarjeta terminaba diciendo
 * "te lo mostramos porque esta por encima de tu presupuesto", que es
 * exactamente el tipo de frase que destruye la confianza que el glass-box viene
 * a construir.
 */
interface Aporte {
  nombre: string;
  /** 0..1. Que tan bien calza el lead con el proyecto en este eje. */
  ajuste: number;
  /** Texto ya legible que va a `Factor.valor`. */
  valor: string;
  /** `true` si este eje es un ARGUMENTO A FAVOR, citable en la razon. */
  favorable: boolean;
}

/**
 * Precio de referencia del proyecto para comparar contra la capacidad: el piso
 * de la banda. Es el numero honesto -- si el lead no alcanza ni el piso, el
 * proyecto no le sirve.
 */
function precioDeReferencia(ficha: ProjectCard): number {
  return ficha.precio.desde;
}

/**
 * Que tanto cabe el proyecto en la capacidad estimada del lead.
 *
 * Sin capacidad estimada devuelve 0.5 (neutro) en vez de 0: no sabemos, y
 * castigar por no saber esconderia proyectos validos.
 */
function aporteCapacidad(capacidad: CapacityBand | null, ficha: ProjectCard): Aporte {
  const techo = capacidad?.precioMaximoEstimado ?? null;
  const precio = precioDeReferencia(ficha);

  if (techo === null) {
    return {
      nombre: 'Capacidad estimada',
      ajuste: 0.5,
      valor: 'todavia no tenemos tu capacidad estimada',
      favorable: false,
    };
  }

  const holgura = (techo - precio) / techo;
  if (holgura < 0) {
    // Queda por encima del techo. Se hunde rapido pero no a cero: un proyecto
    // 5% arriba sigue siendo conversable, uno 50% arriba no.
    return {
      nombre: 'Capacidad estimada',
      ajuste: Math.max(0, 1 + holgura * 3),
      valor: 'queda por encima de tu techo estimado',
      favorable: false,
    };
  }
  // Holgura enorme tampoco es match perfecto: el lead puede aspirar a mas.
  return {
    nombre: 'Capacidad estimada',
    ajuste: holgura > 0.45 ? 0.75 : 1,
    valor: 'cabe en tu techo estimado',
    favorable: true,
  };
}

function aporteUbicacion(lead: LeadProfile, ficha: ProjectCard): Aporte {
  const ciudadLead = lead.ciudad?.trim().toLowerCase() ?? null;
  if (ciudadLead === null || ciudadLead.length === 0) {
    return {
      nombre: 'Ubicacion',
      ajuste: 0.5,
      valor: 'no nos dijiste tu ciudad',
      favorable: false,
    };
  }

  const ciudadProyecto = ficha.ciudad.toLowerCase();
  if (ciudadLead === ciudadProyecto) {
    return { nombre: 'Ubicacion', ajuste: 1, valor: `queda en ${ficha.ciudad}`, favorable: true };
  }

  // Soacha, Chia y Tocancipa son area de influencia de Bogota: para alguien de
  // Bogota son una alternativa real, no otra ciudad.
  const areaBogota = ['bogota', 'soacha', 'chia', 'tocancipa'];
  if (areaBogota.includes(ciudadLead) && areaBogota.includes(ciudadProyecto)) {
    return {
      nombre: 'Ubicacion',
      ajuste: 0.7,
      valor: `queda en ${ficha.ciudad}, cerca de Bogota`,
      favorable: true,
    };
  }

  return {
    nombre: 'Ubicacion',
    ajuste: 0.2,
    valor: `queda en ${ficha.ciudad}`,
    favorable: false,
  };
}

/**
 * Habitaciones necesarias segun el tamano del hogar. Criterio conservador: la
 * pareja duerme junta y los dependientes comparten de a dos.
 */
function habitacionesNecesarias(personasACargo: number): number {
  return 1 + Math.ceil(personasACargo / 2);
}

function aporteTamanoHogar(lead: LeadProfile, ficha: ProjectCard): Aporte {
  const dependientes = lead.personasACargo;
  if (dependientes === null) {
    return {
      nombre: 'Tamano del hogar',
      ajuste: 0.5,
      valor: 'no nos dijiste cuantas personas tienes a cargo',
      favorable: false,
    };
  }

  const necesarias = habitacionesNecesarias(dependientes);
  const etiqueta =
    ficha.habitacionesDesde === ficha.habitacionesHasta
      ? `${String(ficha.habitacionesDesde)} ${ficha.habitacionesDesde === 1 ? 'habitacion' : 'habitaciones'}`
      : `${String(ficha.habitacionesDesde)}-${String(ficha.habitacionesHasta)} habitaciones`;
  // "espacio de sobra" solo cuando de verdad sobra; si calza justo, se dice asi.
  const sobra =
    necesarias < ficha.habitacionesDesde
      ? 'espacio de sobra para tu hogar'
      : 'el tamano justo para tu hogar';

  if (necesarias <= ficha.habitacionesDesde) {
    return {
      nombre: 'Tamano del hogar',
      ajuste: 1,
      valor: `tiene ${etiqueta}, ${sobra}`,
      favorable: true,
    };
  }
  if (necesarias <= ficha.habitacionesHasta) {
    return {
      nombre: 'Tamano del hogar',
      ajuste: 0.85,
      valor: `tiene ${etiqueta} y una tipologia que le calza a tu hogar`,
      favorable: true,
    };
  }
  // Se queda corto. Cuanto mas corto, peor.
  const faltantes = necesarias - ficha.habitacionesHasta;
  return {
    nombre: 'Tamano del hogar',
    ajuste: Math.max(0, 1 - faltantes * 0.4),
    valor: `tiene ${etiqueta} y se queda corto para tu hogar`,
    favorable: false,
  };
}

/**
 * VIS vs NO VIS contra el rango salarial declarado.
 *
 * Un hogar bajo el tope del SFV tiene en la VIS su via de acceso real, porque
 * el subsidio de la caja solo aplica ahi. No es preferencia estetica: es la
 * palanca economica del reto (Ley 21 de 1982, Ley 920 de 2004).
 */
function aporteVivienda(lead: LeadProfile, ficha: ProjectCard): Aporte {
  const rango = lead.rangoSalarial;
  if (rango === null) {
    return {
      nombre: 'Tipo de vivienda',
      ajuste: 0.5,
      valor: 'no nos dijiste tu rango salarial',
      favorable: false,
    };
  }

  const bajoTope = RANGOS_BAJO_TOPE_SFV.includes(rango);
  if (bajoTope) {
    return ficha.esVIS
      ? {
          nombre: 'Tipo de vivienda',
          ajuste: 1,
          valor: `es VIS y aplica al subsidio (hasta ${String(TOPE_SFV_SMMLV)} SMMLV)`,
          favorable: true,
        }
      : {
          nombre: 'Tipo de vivienda',
          ajuste: 0.15,
          valor: 'no es VIS, asi que queda fuera del subsidio',
          favorable: false,
        };
  }

  return ficha.esVIS
    ? {
        nombre: 'Tipo de vivienda',
        ajuste: 0.6,
        valor: 'es VIS, por debajo de tu rango',
        favorable: false,
      }
    : {
        nombre: 'Tipo de vivienda',
        ajuste: 0.9,
        valor: 'no es VIS, acorde a tu rango',
        favorable: true,
      };
}

function cuentaAmenidades(ficha: ProjectCard, buscadas: readonly string[]): number {
  const texto = ficha.amenidades.join(' | ').toLowerCase();
  return buscadas.filter((amenidad) => texto.includes(amenidad)).length;
}

/**
 * Estilo de vida: cruza el segmento del lead con las amenidades del proyecto.
 * Es el factor mas blando y por eso el de menor peso; existe para desempatar,
 * no para decidir.
 */
function aporteEstiloDeVida(lead: LeadProfile, ficha: ProjectCard): Aporte {
  const conNinos = (lead.personasACargo ?? 0) > 0;
  const buscadas = conNinos ? AMENIDADES_FAMILIARES : AMENIDADES_JOVENES;
  const encontradas = cuentaAmenidades(ficha, buscadas);
  const ajuste = Math.min(1, encontradas / 3);

  return {
    nombre: 'Estilo de vida',
    ajuste,
    valor:
      encontradas === 0
        ? 'no tiene amenidades de tu perfil'
        : `tiene ${String(encontradas)} amenidades de tu perfil`,
    favorable: encontradas > 0,
  };
}

/** Redondea a 2 decimales para que el JSON no arrastre ruido de punto flotante. */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Un eje ya evaluado, con el peso que le corresponde pegado al lado. */
interface Eje {
  peso: number;
  aporte: Aporte;
}

/**
 * Evalua los cinco ejes. Es el paso interno del que salen tanto los factores
 * como la razon, para que texto y numeros no se puedan desincronizar.
 *
 * El peso viaja junto al aporte en vez de en un arreglo paralelo: dos listas
 * que hay que mantener en el mismo orden son un bug esperando a que alguien
 * inserte un eje en la mitad.
 */
function evaluar(lead: LeadProfile, ficha: ProjectCard): Eje[] {
  return [
    { peso: PESOS.capacidad, aporte: aporteCapacidad(lead.capacidad, ficha) },
    { peso: PESOS.ubicacion, aporte: aporteUbicacion(lead, ficha) },
    { peso: PESOS.tamanoHogar, aporte: aporteTamanoHogar(lead, ficha) },
    { peso: PESOS.vivienda, aporte: aporteVivienda(lead, ficha) },
    { peso: PESOS.estiloDeVida, aporte: aporteEstiloDeVida(lead, ficha) },
  ];
}

function aFactores(ejes: readonly Eje[]): Factor[] {
  return ejes.map(({ peso, aporte }) => ({
    nombre: aporte.nombre,
    peso,
    valor: aporte.valor,
    // En puntos sobre 100, que es como se lee un score en la UI.
    contribucion: redondear(aporte.ajuste * peso * 100),
    // Adenda A8: intensidad 0-100 = que tan bien puntua el lead en ESTE eje,
    // independiente del peso. `ajuste` vive en 0..1.
    intensidad: Math.round(Math.max(0, Math.min(1, aporte.ajuste)) * 100),
  }));
}

/**
 * Calcula los factores del match. Exportada aparte de `matchProjects` para que
 * los tests puedan afirmar sobre cada eje sin armar una baraja completa.
 */
export function calcularFactores(lead: LeadProfile, ficha: ProjectCard): Factor[] {
  return aFactores(evaluar(lead, ficha));
}

/** Similitud 0..1 a partir de los factores ya calculados. */
export function similitudDe(factores: readonly Factor[]): number {
  const total = factores.reduce((suma, factor) => suma + factor.contribucion, 0);
  return redondear(total / 100);
}

/**
 * Arma el "por que" en lenguaje natural con los dos ejes FAVORABLES que mas
 * aportaron.
 *
 * Se redacta con plantillas y no con el LLM a proposito: la razon tiene que ser
 * consistente con `factores`, y un modelo puede escribir una frase linda que
 * contradiga los numeros que estan al lado.
 */
function explicarDesdeEjes(ejes: readonly Eje[], ficha: ProjectCard): string {
  const aFavor = ejes
    .filter(({ aporte }) => aporte.favorable)
    // Se ordena por aporte real (ajuste x peso), no por ajuste solo: si no, un
    // eje liviano al tope le ganaria a la capacidad, que es lo que mas importa.
    .sort((a, b) => b.aporte.ajuste * b.peso - a.aporte.ajuste * a.peso)
    .slice(0, 2)
    .map(({ aporte }) => aporte.valor);

  if (aFavor.length === 0) {
    // Sin ningun eje a favor se dice justamente eso. Es informacion util: el
    // usuario entiende por que la tarjeta esta al final de la baraja, y no le
    // vendemos como virtud lo que es una carencia.
    return `${ficha.nombre} esta en ${ficha.ciudad}, pero se aleja de lo que buscas.`;
  }

  // Cada `valor` ya es un predicado completo ("cabe en tu techo estimado",
  // "queda en Soacha"), asi que la plantilla no antepone ningun verbo.
  return `Te lo mostramos porque ${aFavor.join(' y ')}.`;
}

/** Version publica: util para tests y para recalcular la razon por separado. */
export function explicarMatch(lead: LeadProfile, ficha: ProjectCard): string {
  return explicarDesdeEjes(evaluar(lead, ficha), ficha);
}

/**
 * Un proyecto cabe en la capacidad si su piso de precio no supera el techo
 * estimado del lead. Estimado contra estimado: la UI lo tiene que decir asi.
 */
export function cabeEnCapacidad(capacidad: CapacityBand | null, ficha: ProjectCard): boolean {
  const techo = capacidad?.precioMaximoEstimado ?? null;
  return techo !== null && precioDeReferencia(ficha) <= techo;
}

/**
 * Ordena el catalogo por afinidad con el lead y devuelve la baraja.
 *
 * No filtra por debajo de un umbral: la baraja completa es informacion util
 * (ver el proyecto que NO calza y por que tambien educa), y F2.1 muestra las
 * tarjetas en orden. Quien quiera recortar, recorta arriba con `limite`.
 */
export function matchProjects(
  lead: LeadProfile,
  catalogo: readonly ProjectCard[],
  limite?: number,
): ProjectMatchCard[] {
  const tarjetas = catalogo.map<ProjectMatchCard>((ficha) => {
    // Se evalua UNA vez y de ahi salen los factores y la razon: asi es
    // imposible que el texto y los numeros de la misma tarjeta se contradigan.
    const ejes = evaluar(lead, ficha);
    const factores = aFactores(ejes);
    const match: ProjectMatch = {
      proyectoId: ficha.proyectoId,
      similitud: similitudDe(factores),
      razon: explicarDesdeEjes(ejes, ficha),
      nombre: ficha.nombre,
      etapa: 'Por confirmar',
      precioDesde: ficha.precio.desde,
      tipologia:
        ficha.tipologias.map((tipologia) => tipologia.nombre).join(' / ') || 'Por confirmar',
    };
    return {
      ficha,
      match,
      factores,
      cabeEnCapacidad: cabeEnCapacidad(lead.capacidad, ficha),
    };
  });

  tarjetas.sort((a, b) => {
    if (b.match.similitud !== a.match.similitud) {
      return b.match.similitud - a.match.similitud;
    }
    // Desempate estable por id: dos barajas del mismo lead deben salir iguales.
    return a.ficha.proyectoId.localeCompare(b.ficha.proyectoId);
  });

  return limite === undefined ? tarjetas : tarjetas.slice(0, limite);
}
