/**
 * ============================================================================
 *  contracts.ts — FUENTE DE VERDAD DEL CONTRATO COMPARTIDO
 * ============================================================================
 *
 *  Este archivo es la ÚNICA superficie de coordinación entre features y entre
 *  repos (backend <-> frontend). Vive en `perfilador-vivienda-backend` y se
 *  copia al frontend con `npm run contracts:sync`.
 *
 *  REGLAS (ver EQUIPO.md, seccion "Reglas de iteracion con IA"):
 *   1. NUNCA edites la copia del frontend. Edita aqui y corre el sync.
 *   2. Cualquier cambio aqui ROMPE A TODO EL EQUIPO: anunciarlo en el canal
 *      del equipo antes de hacer merge (regla 16).
 *   3. Si te falta un dato, PROPONE el campo. No lo agregues en silencio
 *      dentro de tu feature (regla 17).
 *   4. Este archivo es dominio puro: CERO imports de frameworks, CERO `any`,
 *      cero logica. Solo tipos, uniones y constantes.
 *
 *  CONVENCION DE IDIOMA (regla 7): identificadores tecnicos en ingles,
 *  terminos del dominio del negocio en espanol porque son el lenguaje ubicuo
 *  de Colsubsidio (`afiliado`, `subsidio`, `segmento`, `carril`).
 *
 * ----------------------------------------------------------------------------
 *  ADENDAS AL CONTRATO DEL BRIEF (cambios explicitos, no silenciosos)
 * ----------------------------------------------------------------------------
 *  A1. `consentimiento: ConsentRecord | null` — AGREGADO. La Ley 1581 de 2012
 *      exige consentimiento previo, expreso e informado ANTES de tratar datos
 *      personales. Sin este campo la solucion no es implementable por una
 *      entidad Vigilada Supersubsidio. Es un gate legal, no un slot.
 *  A2. `ContactIdentity` con telefono ENMASCARADO + `contactoTokenId` —
 *      AGREGADO. El closer necesita llamar, pero el dato de contacto real
 *      nunca viaja en el DTO: vive detras de `ContactVaultPort` en
 *      infrastructure. Principio de minimizacion de datos (Ley 1581, art. 4).
 *  A3. `segmento` pasa de `string | null` a `Segmento | null`. El brief ya
 *      enumeraba los 4 valores en un comentario; los volvemos tipo para
 *      "modelar estados imposibles como imposibles" (regla 8).
 *  A4. `Meta` — DEFINIDO. El brief lo referencia en `EducationJourney` pero no
 *      lo declara.
 *  A5. Tipos de F1 (conversacion), F3 (dashboard/auth) y F4 (briefing) —
 *      AGREGADOS. El brief describe sus casos de uso pero no sus DTOs.
 *  A6. `NonViableReason` — AGREGADO. F2.2 recibe "LeadProfile no viable + razon"
 *      segun el brief; la razon necesitaba un tipo.
 *  A7. `rangoSalarial` y `segmentoFamiliar` se quedan como `string | null`
 *      A PROPOSITO: su vocabulario real sale del Excel de 4.142 compradores y
 *      todavia no esta confirmado. Ver `RANGOS_SALARIALES_SMMLV` mas abajo:
 *      cerrar el tipo cuando data/analisis confirme las bandas.
 *  A8. Datos que exige la consola del closer (F3/F4). El diseno aprobado de la
 *      ficha de llamada muestra informacion que el contrato original no
 *      modelaba y que sin ella no se puede armar:
 *        - `Factor.intensidad`  -> largo de la barra (0-100). `contribucion`
 *          son puntos con signo y `peso` es el peso del factor; ninguno de los
 *          dos sirve para dibujar la barra sin normalizar.
 *        - `ProjectMatch` gana `nombre`, `etapa`, `precioDesde` y `tipologia`:
 *          el closer lee el match en voz alta durante la llamada y no puede
 *          esperar a que el front resuelva un `proyectoId` contra otro endpoint.
 *        - `EnrichedLead` gana `edad`, `ocupacion`, `hogar`, `ingresosSmmlv`,
 *          `subsidioEstimado`, `citaTextual`, `contactabilidad`, `horarioRazon`
 *          y `timeline`.
 *        - `ViableLeadListItem` gana `edad`, `ocupacion`, `capacidadEstimada`,
 *          `cuotaEstimada`, y cambia `proyectoTopId` por `proyectoTop`.
 *        - `BriefingSheet` gana `resumenScore` y `objeciones`.
 *        - `LeadListFilters` gana `soloNutridos` y `busqueda`;
 *          `LeadListSort` gana `capacidad_desc`.
 *      Nuevos tipos: `ContactabilidadDia`, `LeadTimelineEvent`,
 *      `ObjecionSugerida`.
 *  A9. `EtapaCamino` / `ContenidoEducativo` y los campos OPCIONALES
 *      `Meta.etapa?` y `EducationJourney.etapas?` — AGREGADOS para F2.2
 *      ("Camino a Mi Hogar"). El brief describe un journey gamificado por
 *      hitos del comprador; estos tipos modelan las 5 etapas del recorrido y
 *      el microlearning curado de cada una. Son ADITIVOS y OPCIONALES: no
 *      rompen a F1/F2.1/F3/F4, que pueden ignorarlos. El scoring y la
 *      reclasificacion siguen siendo deterministas (glass-box); estos tipos
 *      solo describen la presentacion del recorrido, no deciden nada.
 *  A11. F5 · call-simulation — AGREGADO. Entrenador de cierre por voz: el
 *      closer practica la llamada con un lead simulado antes de marcar de
 *      verdad. `API_ROUTES.closer.call` pasa de string a `{start,turn,end}`.
 *      Nuevos tipos: `CallDifficulty`, `CallMood`, `CallOutcome`,
 *      `SimulatedVoice`, `CallTurnAudio`, `CallTurn`, `PersonaContext`,
 *      `CallSimulationSession`, `CallScorecard`.
 *  A12. F5 · transcripcion del closer — AGREGADO. La Web Speech API del
 *      navegador NO es un motor local: es un mando a distancia al servicio en
 *      la nube de cada fabricante. Chrome habla con el de Google y funciona;
 *      Edge enruta al suyo y en macOS devuelve `network` siempre; Firefox no
 *      la implementa. Como el dictado tiene que servir en cualquier navegador,
 *      la transcripcion pasa a ser NUESTRA: el front captura PCM crudo con
 *      Web Audio API (universal) y el backend la resuelve.
 *      `API_ROUTES.closer.call` gana `transcribe`. Nuevos tipos:
 *      `UtteranceAudio`, `TranscriptionResult`.
 *  A13. F5 · `CallScorecard` gana `factores: Factor[]` — AGREGADO. El puntaje
 *      es una media ponderada (55% interes, 25% guion, 20% objeciones) y sin
 *      el desglose el dial parece contradecir al `interesFinal` que se muestra
 *      al lado. Reutiliza el `Factor` del scoring de leads: es el mismo
 *      compromiso glass-box, y el front ya sabe dibujarlo con `FactorBars`.
 *  A14. F5 · grabacion y highlights — AGREGADO. La llamada se guarda entera
 *      (transcripcion + audio) y un LLM redacta el analisis. Nuevos tipos:
 *      `CallHighlightTipo`, `CallHighlight`, `CallHighlights`,
 *      `CallRecordingRef`, `CallRecord`. `CallScorecard` gana `highlights`.
 *
 *      GLASS-BOX: los highlights son NARRATIVA (el LLM redacta sobre hechos ya
 *      calculados), nunca aritmetica. `outcome` y `puntaje` los sigue
 *      decidiendo `verdict.ts`. Si el LLM falla, `highlights` es `null` y el
 *      veredicto se muestra igual.
 * ============================================================================
 */

/* ==========================================================================
 *  0. Unidades y primitivos del dominio
 * ========================================================================== */

/**
 * Pesos colombianos, SIEMPRE entero y SIEMPRE en pesos (no en miles, no en
 * millones).
 *
 * TRAMPA DE DATOS del reto: en el Excel de compradores el valor de vivienda
 * viene con ceros de mas (`523.620` significa ~523 millones). La normalizacion
 * ocurre UNA sola vez, en el pipeline offline de `analysis/`. A partir de ahi
 * todo lo que cruce este contrato ya viene normalizado: 523_620_000.
 * El frontend SOLO formatea para mostrar; nunca corrige escalas.
 */
export type COP = number;

/** ISO-8601 en UTC, p. ej. `2026-07-24T14:03:11.000Z`. */
export type IsoDateTime = string;

/** Salario Minimo Mensual Legal Vigente. El umbral del SFV es <= 4 SMMLV. */
export const SMMLV_2026: COP = 1_623_500;

/** Tope de ingresos del hogar para aspirar al Subsidio Familiar de Vivienda. */
export const TOPE_SFV_SMMLV = 4;

/* ==========================================================================
 *  1. Vocabulario del negocio
 * ========================================================================== */

/** Segmento de caja de compensacion. Los 4 valores vienen del brief. */
export type Segmento = 'Basico' | 'Medio' | 'Alto' | 'Joven';

export const SEGMENTOS: readonly Segmento[] = ['Basico', 'Medio', 'Alto', 'Joven'];

/**
 * Vocabulario TENTATIVO de rangos salariales, en multiplos de SMMLV.
 * Confirmar contra el Excel en el pipeline de `analysis/` y recien entonces
 * cerrar `LeadProfile.rangoSalarial` a una union (ver adenda A7).
 */
export const RANGOS_SALARIALES_SMMLV: readonly string[] = [
  '0-2 SMMLV',
  '2-4 SMMLV',
  '4-6 SMMLV',
  '6-10 SMMLV',
  '>10 SMMLV',
];

/** Vocabulario TENTATIVO de segmento familiar. Confirmar contra buyer personas. */
export const SEGMENTOS_FAMILIARES: readonly string[] = [
  'Unipersonal',
  'Pareja sin hijos',
  'Pareja con hijos',
  'Monoparental',
  'Familia extensa',
];

/** Vocabulario cerrado de estado civil para el perfilamiento F1. */
export const ESTADOS_CIVILES: readonly string[] = [
  'Soltero/a',
  'Casado/a',
  'Unión libre',
  'Separado/a',
  'Divorciado/a',
  'Viudo/a',
];

/**
 * Datos que la conversacion de F1 tiene que llenar.
 * Incluye identidad de contacto (nombre/email/telefono/edad/estadoCivil/
 * ocupacion) + los 8 campos de perfilamiento/scoring.
 */
export type Slot =
  | 'nombre'
  | 'email'
  | 'telefono'
  | 'edad'
  | 'estadoCivil'
  | 'ocupacion'
  | 'afiliacion'
  | 'rangoSalarial'
  | 'segmento'
  | 'personasACargo'
  | 'ciudad'
  | 'segmentoFamiliar'
  | 'ahorro'
  | 'capacidadAhorroMensual';

export const SLOTS: readonly Slot[] = [
  'nombre',
  'email',
  'telefono',
  'edad',
  'estadoCivil',
  'ocupacion',
  'afiliacion',
  'rangoSalarial',
  'segmento',
  'personasACargo',
  'ciudad',
  'segmentoFamiliar',
  'ahorro',
  'capacidadAhorroMensual',
];

/** Carril al que se enruta el lead al final de F1. */
export type Carril = 'viable' | 'no_viable';

/** Banda de capacidad estimada SIN consultar DataCredito (fuera de alcance). */
export type Banda = 'alta' | 'media' | 'baja';

/* ==========================================================================
 *  2. Consentimiento y contacto  (adendas A1 y A2 — requisito legal)
 * ========================================================================== */

/**
 * Finalidades del tratamiento. La Ley 1581 exige que sean explicitas y
 * acotadas: no se puede pedir consentimiento "para todo".
 */
export type FinalidadTratamiento =
  'perfilamiento_vivienda' | 'contacto_comercial' | 'educacion_financiera';

/**
 * Evidencia de consentimiento previo, expreso e informado (Ley 1581 de 2012,
 * Decreto 1377 de 2013). Sin `otorgado === true` el pipeline NO debe persistir
 * ni perfilar. `versionPolitica` permite demostrar QUE texto acepto el titular.
 */
export interface ConsentRecord {
  otorgado: boolean;
  versionPolitica: string;
  finalidades: FinalidadTratamiento[];
  otorgadoEn: IsoDateTime;
  /** Canal por el que se capturo, p. ej. `web-chat`. Nunca guardamos la IP. */
  canal: string;
}

/**
 * Identidad minima viable para que un closer pueda llamar.
 *
 * NO contiene el telefono real ni cedula. `contactoTokenId` es una referencia
 * opaca que `ContactVaultPort` (infrastructure) resuelve solo en el momento de
 * marcar, con autorizacion de rol closer y registro en auditoria.
 */
export interface ContactIdentity {
  /** Solo nombre de pila. Nunca apellidos + documento juntos. */
  nombre: string;
  /** Formato de presentacion: `+57 3.. ... ..42`. Nunca el numero completo. */
  telefonoEnmascarado: string;
  /** Referencia opaca al dato real, resuelta por ContactVaultPort. */
  contactoTokenId: string;
}

/* ==========================================================================
 *  3. Scoring glass-box
 * ========================================================================== */

/**
 * Un factor del score con su aporte. Existe para que TODA clasificacion se
 * pueda explicar (regla 13: si no se puede explicar, no se muestra).
 */
export interface Factor {
  nombre: string;
  /** Peso del factor en el score final. Sale de `data/weights.json`. */
  peso: number;
  /** Valor observado del lead para este factor, ya legible por humanos. */
  valor: string;
  /**
   * Aporte con signo a los puntos finales. Permite ordenar por impacto real
   * y mostrar que factores SUMAN y cuales RESTAN.
   */
  contribucion: number;
  /**
   * Que tan bien puntua el lead en ESTE factor, 0-100. Es lo unico que se
   * puede dibujar como barra: `contribucion` trae signo y `peso` describe al
   * modelo, no al lead. Adenda A8.
   */
  intensidad: number;
}

/**
 * Resultado del scoring determinista. `valor` es 0-100.
 *
 * GLASS-BOX (regla 12): esto lo produce una funcion pura calibrada contra los
 * 4.142 compradores reales. El LLM no participa. `factores` no es opcional:
 * es la evidencia de la decision.
 */
export interface ScoreResult {
  valor: number;
  factores: Factor[];
  /** Version de `weights.json` usada. Hace auditable el score en el tiempo. */
  weightsVersion: string;
  calculadoEn: IsoDateTime;
}

/** Capacidad estimada sin bureau de credito. `faltantes` = slots aun vacios. */
export interface CapacityBand {
  banda: Banda;
  faltantes: Slot[];
  /** Cuota mensual que el lead podria sostener, estimada. */
  cuotaMensualEstimada: COP | null;
  /** Techo de precio de vivienda alcanzable = ahorro + subsidio + credito. */
  precioMaximoEstimado: COP | null;
}

/**
 * Proyecto afin al lead + el porque, en lenguaje natural.
 *
 * Trae el proyecto ya resuelto (nombre, etapa, precio, tipologia) y no solo su
 * id: el closer lo lee en voz alta mientras habla con el cliente y no puede
 * depender de que el front cruce el id contra otro endpoint. Adenda A8.
 */
export interface ProjectMatch {
  proyectoId: string;
  /** 0-1. Similitud contra el buyer persona real del proyecto. */
  similitud: number;
  razon: string;
  nombre: string;
  /** Etapa comercial, p. ej. `Etapa 3`. */
  etapa: string;
  precioDesde: COP;
  /** Tipologia legible, p. ej. `VIS · 3 hab`. */
  tipologia: string;

  /**
   * 0-1. Fraccion del peso del puntaje que se evaluo con datos REALES.
   *
   * EXISTE PORQUE `similitud` TIENE PISO. Los ejes sin dato del lead puntuan
   * neutro (0.5) en vez de cero -- castigar por no saber esconderia proyectos
   * validos -- pero eso hace que un lead del que no sabemos nada saque ~50% de
   * afinidad. Sin este campo, ese 50% se lee como "medio compatible" cuando
   * significa "no sabemos". La UI DEBE rotular el porcentaje como parcial
   * cuando `confianza < 1`, y nunca presentarlo como un hecho cerrado.
   *
   * `confianza: 0` es el caso de datos no calibrados (perfiles de compradores
   * inventados, semillas de demo): el numero ordena, pero no significa nada.
   */
  confianza: number;
  /**
   * Que le falto al calculo, en lenguaje ya legible ("tu ciudad", "tu rango
   * salarial"). Vacio cuando `confianza === 1`. Es el detalle que acompana a
   * `confianza`: decir "parcial" sin decir de que sirve de poco.
   */
  datosFaltantes: string[];
  /**
   * Si el proyecto cabe en el techo estimado del lead. `null` = no se pudo
   * evaluar porque no hay capacidad estimada -- que NO es lo mismo que `false`.
   *
   * Viaja pegado a `similitud` a proposito: un proyecto por encima del techo
   * puede sacar un puntaje alto (la capacidad se hunde gradual, no de golpe) y
   * quedar de segundo en la baraja. Mostrar ese 81% sin decir que no le alcanza
   * es precisamente lo que el glass-box viene a impedir.
   */
  cabeEnCapacidad: boolean | null;
}

/* ==========================================================================
 *  4. LeadProfile — el objeto central que viaja por toda la tuberia
 * ========================================================================== */

export interface LeadProfile {
  id: string;

  /** Gate legal. Se captura ANTES de cualquier pregunta de perfilamiento. */
  consentimiento: ConsentRecord | null;
  /** Identidad tokenizada capturada por F1; el telefono real queda en el vault. */
  identidad: ContactIdentity | null;

  /** --- Identidad de contacto (F1, post-consentimiento) --- */
  /** Nombre de pila o nombre completo declarado por el titular. */
  nombre: string | null;
  email: string | null;
  /** Telefono normalizado (solo digitos). No viaja al dashboard del closer sin vault. */
  telefono: string | null;
  /** Edad EXACTA declarada por el titular, no un tramo. */
  edad: number | null;
  estadoCivil: string | null;
  /** Ocupacion declarada en texto libre, p. ej. `Independiente`. */
  ocupacion: string | null;

  /** --- Se llena en la conversacion (F1) --- */
  esAfiliado: boolean | null;
  rangoSalarial: string | null;
  segmento: Segmento | null;
  personasACargo: number | null;
  ciudad: string | null;
  segmentoFamiliar: string | null;
  ahorroDeclarado: COP | null;
  capacidadAhorroMensual: COP | null;
  slotsLlenos: Slot[];

  /** --- Lo produce la tuberia (F1) --- */
  capacidad: CapacityBand | null;
  score: ScoreResult | null;
  proyectos: ProjectMatch[];
  carril: Carril | null;

  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/* ==========================================================================
 *  5. F1 · lead-intake — conversacion
 * ========================================================================== */

/** Opcion tappable. Regla UX: que no se sienta un interrogatorio. */
export interface QuickReply {
  label: string;
  value: string;
}

/**
 * Un paso de la conversacion. `slot === null` cuando el paso no pide un dato
 * (saludo, consentimiento, cierre).
 */
export interface ConversationStep {
  id: string;
  slot: Slot | null;
  tipo: 'saludo' | 'consentimiento' | 'pregunta' | 'confirmacion' | 'cierre';
  /** `true` si el paso admite texto libre ademas de las opciones. */
  permiteTextoLibre: boolean;
  quickReplies: QuickReply[];
}

/** Mensaje que el bot pinta en la UI estilo WhatsApp. */
export interface BotMessage {
  id: string;
  texto: string;
  /** Redactado por el LLM cuando aplica; la DECISION nunca es del LLM. */
  quickReplies: QuickReply[];
  emisor: 'bot';
  enviadoEn: IsoDateTime;
}

export interface UserMessage {
  id: string;
  texto: string;
  emisor: 'usuario';
  enviadoEn: IsoDateTime;
}

export type ChatMessage = BotMessage | UserMessage;

/** Respuesta de un turno de conversacion. */
export interface ConversationTurn {
  profile: LeadProfile;
  mensajes: BotMessage[];
  /** Paso siguiente, o `null` si la conversacion ya enruto. */
  siguientePaso: ConversationStep | null;
  /** Progreso 0-1 para la barra de avance. */
  progreso: number;
  /** Se llena solo cuando F1 termino de enrutar. */
  routing: RoutingDecision | null;
}

/** Por que un lead no es viable. F2.2 lo necesita para armar el plan. */
export type NonViableReason =
  | 'sin_capacidad'
  | 'ahorro_insuficiente'
  | 'no_afiliado_sin_cupo'
  | 'score_bajo'
  | 'datos_insuficientes';

/**
 * Decision de enrutamiento. Determinista y explicable (regla 12).
 * `razones` esta vacio cuando `carril === 'viable'`.
 */
export interface RoutingDecision {
  carril: Carril;
  razones: NonViableReason[];
  /** Explicacion en lenguaje natural para mostrar al usuario. */
  explicacion: string;
  decididoEn: IsoDateTime;
}

/* ==========================================================================
 *  6. F2.1 · lead-enrichment
 * ========================================================================== */

export type SwipeAction = 'pass' | 'like' | 'favorito';

export interface ProjectMatchCard {
  ficha: ProjectCard;
  match: ProjectMatch;
  factores: Factor[];
}

export interface EnrichmentDeck {
  leadId: string;
  tarjetas: ProjectMatchCard[];
  catalogoVersion: string;
  generadoEn: IsoDateTime;
}

export interface SwipeEvent {
  leadId: string;
  proyectoId: string;
  accion: SwipeAction;
  decididoEn: IsoDateTime;
  dwellMs: number | null;
  abrioDetalle: boolean;
  detalleMs: number | null;
}

export interface ViewEvent {
  leadId: string;
  proyectoId: string | null;
  seccion: string;
  dwellMs: number;
  ocurridoEn: IsoDateTime;
}

export interface EnrichmentSessionSummary {
  leadId: string;
  startedAt: IsoDateTime;
  endedAt: IsoDateTime;
  totalTarjetas: number;
  decididas: number;
  likes: number;
  favoritos: number;
  passes: number;
  intentScore: number;
  tiempoTotalMs: number;
}

export interface EnrichmentTelemetry {
  views: ViewEvent[];
  session: EnrichmentSessionSummary;
}

export interface EnrichmentSummary {
  lead: EnrichedLead;
  guardados: ProjectCard[];
  swipes: SwipeEvent[];
}

export interface ContactPreference {
  canalPreferido: string;
  mejorHorario: string;
}

/** Dia de la semana con que tan contactable ha sido el lead ahi. Adenda A8. */
export interface ContactabilidadDia {
  dia: 'L' | 'M' | 'X' | 'J' | 'V' | 'S' | 'D';
  /** 0-100, relativo a la mejor franja del propio lead. */
  intensidad: number;
}

/** Hito del recorrido del lead, para que el closer sepa de donde viene. */
export type TipoHito = 'ingreso' | 'consentimiento' | 'perfilamiento' | 'nutricion' | 'viable';

/** Evento del recorrido del lead. Adenda A8. */
export interface LeadTimelineEvent {
  label: string;
  /** Ya formateada para mostrar: el backend conoce la zona horaria, el front no. */
  fecha: string;
  hito: TipoHito;
}

export interface EnrichedLead extends LeadProfile {
  intereses: string[];
  zonaPreferida: string | null;
  timingCompra: string | null;
  motivacion: string | null;
  contacto: ContactPreference | null;
  /** 0-100. Intencion de compra. Determinista, igual que el score. */
  intentScore: number;
  enriquecidoEn: IsoDateTime;

  /** --- Adenda A8: lo que la ficha de llamada (F4) necesita mostrar --- */
  edad: number | null;
  ocupacion: string | null;
  /** Composicion del hogar en texto, p. ej. `2 personas a cargo`. */
  hogar: string | null;
  /** Ingresos en multiplos de SMMLV. Decide si aplica al SFV (tope 4). */
  ingresosSmmlv: number | null;
  /** SFV ESTIMADO. `null` si no aplica. Jamas presentarlo como aprobado. */
  subsidioEstimado: COP | null;
  /** Cita textual del lead. Le da al closer sus propias palabras. */
  citaTextual: string | null;
  contactabilidad: ContactabilidadDia[];
  /** Por que ese es el mejor horario. Sin el, el dato no es accionable. */
  horarioRazon: string | null;
  timeline: LeadTimelineEvent[];
}

/* ==========================================================================
 *  7. F2.2 · lead-education (gamificado) — "Camino a Mi Hogar"
 * ========================================================================== */

/**
 * Las 5 etapas del recorrido del comprador (adenda A8). No son "materias":
 * son hitos reales del camino a la vivienda. El orden es fijo y el usuario
 * avanza de una a la siguiente a medida que completa metas.
 */
export type EtapaId = 'descubrir' | 'capacidad' | 'financiar' | 'prepararse' | 'llegar';

/** Una etapa del "Camino a Mi Hogar", ya lista para pintar en la UI. */
export interface EtapaCamino {
  id: EtapaId;
  titulo: string;
  /** Clave/emoji del icono. Presentacion, no logica. */
  icono: string;
  /** 1..5. Posicion en el recorrido. */
  orden: number;
}

/**
 * Catalogo canonico de las 5 etapas. Fuente de verdad compartida back/front
 * para que ambos pinten el mismo camino sin duplicar textos.
 */
export const ETAPAS_CAMINO: readonly EtapaCamino[] = [
  { id: 'descubrir', titulo: 'Descubrir si puedes comprar', icono: 'search', orden: 1 },
  { id: 'capacidad', titulo: 'Entender tu capacidad', icono: 'calculator', orden: 2 },
  { id: 'financiar', titulo: 'Cómo financiar tu vivienda', icono: 'landmark', orden: 3 },
  { id: 'prepararse', titulo: 'Prepararte para comprar', icono: 'list-checks', orden: 4 },
  { id: 'llegar', titulo: 'Llegar a tu vivienda', icono: 'key-round', orden: 5 },
];

/**
 * Microlearning curado de una etapa. `cuerpo` es texto corto pensado para
 * consumo en celular. Contenido DETERMINISTA: no lo genera un LLM en la demo
 * (glass-box + autogestionado a prueba de jurado).
 */
export interface ContenidoEducativo {
  id: string;
  etapa: EtapaId;
  titulo: string;
  cuerpo: string;
  tipoContenido: 'concepto' | 'simulacion' | 'checklist';
  /** Id del video de YouTube (no la URL completa). Opcional: no toda lección tiene video. */
  videoId?: string;
}

/**
 * Plan de nutricion basado en el Subsidio Familiar de Vivienda.
 *   gap   = precioObjetivo - ahorro - subsidioEstimado
 *   meses = gap / capacidadAhorroMensual
 */
export interface NurturePlan {
  precioObjetivo: COP;
  subsidioEstimado: COP;
  gap: COP;
  mesesParaCalificar: number;
  proyectoObjetivoId: string;
  /** `true` si el hogar esta <= 4 SMMLV y por eso aspira al SFV. */
  aplicaSubsidio: boolean;
}

export type TipoMeta = 'ahorro' | 'documentacion' | 'afiliacion' | 'educacion';

/** Un abono individual a una meta de ahorro (adenda A10). */
export interface AporteAhorro {
  id: string;
  monto: COP;
  ocurridoEn: IsoDateTime;
}

/** Meta gamificada del journey (adenda A4). */
export interface Meta {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: TipoMeta;
  /** Valor a alcanzar. COP para metas de ahorro, 1 para metas booleanas. */
  objetivo: number;
  alcanzado: number;
  completada: boolean;
  puntos: number;
  badgeId: string | null;
  /** Etapa del "Camino a Mi Hogar" a la que pertenece la meta (adenda A8). */
  etapa?: EtapaId;
  /**
   * Fecha límite que el usuario se propone para la meta (adenda A10). Solo
   * aplica a metas `tipo: 'ahorro'`; opcional porque el usuario puede no
   * haberla configurado todavía.
   */
  fechaObjetivo?: IsoDateTime;
  /**
   * Historial de abonos individuales (adenda A10). Solo aplica a metas
   * `tipo: 'ahorro'`. Permite calcular el ritmo real de ahorro, a diferencia
   * de `alcanzado`, que es solo el total acumulado.
   */
  aportes?: AporteAhorro[];
}

export interface Badge {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  desbloqueadoEn: IsoDateTime | null;
}

export interface EducationJourney {
  leadId: string;
  plan: NurturePlan;
  metas: Meta[];
  /** 0-1. Avance agregado del journey. */
  progreso: number;
  puntosTotales: number;
  badges: Badge[];
  reclasificadoAViable: boolean;
  /** Por que entro a nutricion. Viene de `RoutingDecision.razones`. */
  razonesIngreso: NonViableReason[];
  /**
   * Las etapas del "Camino a Mi Hogar" en orden (adenda A8). Opcional para no
   * romper consumidores previos; F2.2 siempre lo llena con `ETAPAS_CAMINO`.
   */
  etapas?: EtapaCamino[];
  actualizadoEn: IsoDateTime;
}

/**
 * Snapshot del lead para F2.2: lo que F1 ya perfiló, incluido identidad
 * declarada por el titular. Este DTO alimenta la UI del propio lead (no la
 * consola del closer). El telefono viaja enmascarado; el closer usa
 * `ContactVaultPort` + `ContactIdentity` para revelar el real.
 */
export interface EducationLeadSnapshot {
  leadId: string;
  nombre: string | null;
  email: string | null;
  telefonoEnmascarado: string | null;
  edad: number | null;
  estadoCivil: string | null;
  esAfiliado: boolean | null;
  rangoSalarial: string | null;
  segmento: Segmento | null;
  personasACargo: number | null;
  ciudad: string | null;
  segmentoFamiliar: string | null;
  ahorroDeclarado: COP | null;
  capacidadAhorroMensual: COP | null;
  score: number | null;
  banda: Banda | null;
  cuotaMensualEstimada: COP | null;
  precioMaximoEstimado: COP | null;
  /** Top proyectos que F1 ya matcheó (puede ir vacío). */
  proyectos: ProjectMatch[];
}

/**
 * Ritmo de ahorro real de la meta `tipo: 'ahorro'` (adenda A10). Se calcula
 * on-the-fly a partir de `Meta.aportes` — NO se persiste — por eso vive en la
 * vista (`EducationJourneyView`) y no en `Meta`: es derivado, no estado.
 */
export interface RitmoAhorro {
  /** COP promedio por mes calendario, desde el primer aporte hasta ahora. */
  ritmoMensualPromedio: number;
  /** `null` cuando `ritmoMensualPromedio` es 0: no hay con que proyectar. */
  mesesRestantesAlRitmoActual: number | null;
  /** `null` cuando la meta no tiene `fechaObjetivo` configurada. */
  enRitmoParaFecha: boolean | null;
}

/**
 * Respuesta de `GET /api/leads/education/journey`: journey + contenidos +
 * snapshot del perfil F1 para que el front no invente datos de demo.
 */
export interface EducationJourneyView {
  journey: EducationJourney;
  contenidos: ContenidoEducativo[];
  lead: EducationLeadSnapshot;
  /**
   * Ritmo de ahorro de `meta-ahorro`, cuando el journey tiene meta de ahorro
   * (adenda A10). `undefined` si el journey no tiene brecha de ahorro (F2.2
   * omite `meta-ahorro` cuando `plan.gap === 0`).
   */
  ritmoAhorro?: RitmoAhorro;
}

/** Evento que mueve el progreso del journey. */
export interface ProgressEvent {
  tipo: 'ahorro_registrado' | 'contenido_visto' | 'meta_completada' | 'afiliacion_iniciada';
  metaId: string | null;
  valor: number;
  ocurridoEn: IsoDateTime;
}

/* ==========================================================================
 *  8. F3 · closer-dashboard
 * ========================================================================== */

export type Rol = 'closer';

/** Sesion de closer. El token real va en cookie httpOnly, NO en este DTO. */
export interface CloserSession {
  closerId: string;
  nombre: string;
  rol: Rol;
  expiraEn: IsoDateTime;
}

/** Fila del dashboard. Vista adelgazada: no arrastra el journey completo. */
export interface ViableLeadListItem {
  leadId: string;
  nombre: string;
  esAfiliado: boolean;
  segmento: Segmento | null;
  ciudad: string | null;
  score: number;
  intentScore: number;
  banda: Banda | null;
  /** Top-3 factores, ya ordenados por contribucion. */
  topFactores: Factor[];
  /** `true` si llego reclasificado desde F2.2. Senal fuerte de intencion. */
  vieneDeNutricion: boolean;
  actualizadoEn: IsoDateTime;

  /** --- Adenda A8: lo que la fila del dashboard (F3) necesita mostrar --- */
  edad: number | null;
  ocupacion: string | null;
  /** Techo de precio alcanzable. Espejo de `CapacityBand.precioMaximoEstimado`. */
  capacidadEstimada: COP | null;
  cuotaEstimada: COP | null;
  /**
   * Mejor match ya resuelto. Reemplaza al `proyectoTopId` original: la fila
   * muestra nombre, etapa y afinidad, y resolver un id por fila seria N+1.
   */
  proyectoTop: ProjectMatch | null;
}

export interface LeadListFilters {
  soloAfiliados: boolean | null;
  segmento: Segmento | null;
  ciudad: string | null;
  scoreMinimo: number | null;
  banda: Banda | null;
  /** Solo leads recuperados por el carril de nutricion (F2.2). Adenda A8. */
  soloNutridos: boolean | null;
  /** Texto libre sobre nombre, zona, ocupacion y proyecto. Adenda A8. */
  busqueda: string | null;
}

export type LeadListSort = 'score_desc' | 'capacidad_desc' | 'intent_desc' | 'recencia_desc';

export interface LeadListPage {
  items: ViableLeadListItem[];
  total: number;
  pagina: number;
  porPagina: number;
}

/* ==========================================================================
 *  9. F4 · closer-briefing
 * ========================================================================== */

/** Punto de conversacion sugerido para la llamada en vivo. */
export interface TalkingPoint {
  titulo: string;
  detalle: string;
  /** De donde salio: da credibilidad frente al closer y frente al jurado. */
  origen: 'score' | 'matching' | 'intereses' | 'capacidad' | 'nutricion';
  prioridad: number;
}

/** Objecion probable del lead + como responderla. Adenda A8. */
export interface ObjecionSugerida {
  /** Lo que probablemente diga el lead, en sus palabras. */
  pregunta: string;
  /** Como responder. Nunca prometer aprobacion de credito ni de subsidio. */
  respuesta: string;
}

/**
 * Ficha tecnica read-optimized. Se mira DURANTE una llamada: densa pero
 * escaneable. La arma un solo caso de uso para que el front no orqueste.
 */
export interface BriefingSheet {
  lead: EnrichedLead;
  /** `null` si el lead nunca paso por nutricion. */
  journey: EducationJourney | null;
  talkingPoints: TalkingPoint[];
  /** Alertas duras: p. ej. cupo 90/10, o consentimiento vencido. */
  alertas: string[];
  generadoEn: IsoDateTime;

  /**
   * Una frase que explica el score en lenguaje natural. Adenda A8.
   * Lo REDACTA el LLM a partir de los factores ya calculados; no los calcula
   * (regla 12, glass-box).
   */
  resumenScore: string;
  objeciones: ObjecionSugerida[];
}

/* ==========================================================================
 *  10. F5 · call-simulation — entrenador de cierre
 *
 *  Roleplay de voz para que el closer practique la llamada ANTES de marcar de
 *  verdad. NO es telefonia: nadie se marca, `revealContact` no interviene.
 *
 *  GLASS-BOX (regla 12), igual que el resto del contrato: el LLM detras de
 *  `CallSimulatorPort` (nuevo, separado de `LlmPort`) solo interpreta a la
 *  persona turno a turno; el `outcome` y el `puntaje` de `CallScorecard` los
 *  calcula una funcion pura determinista a partir de la senal que el LLM
 *  reporta (`interes`, `mood`, objeciones), nunca el LLM directamente.
 *
 *  SIN PII: `PersonaContext` es un recorte del `BriefingSheet` sin telefono,
 *  sin apellidos y sin documento — es lo unico que via a un prompt de LLM.
 * ========================================================================== */

/** Que tan dificil de convencer es el lead simulado. Elegido antes de llamar. */
export type CallDifficulty = 'receptivo' | 'realista' | 'dificil';

/** Estado de animo del lead simulado en un turno. Lo reporta el LLM, validado con zod. */
export type CallMood = 'frio' | 'neutral' | 'interesado' | 'entusiasta' | 'molesto';

/** Resultado de la llamada. Lo decide `verdict.ts` (dominio puro), no el LLM. */
export type CallOutcome = 'agenda_visita' | 'lo_piensa' | 'no_cierra' | 'colgo';

/** Voz de Polly asignada a la sesion. No existe `es-CO`: se usa `es-MX`/`es-US`. */
export interface SimulatedVoice {
  voiceId: string;
  engine: 'generative' | 'neural' | 'standard';
  languageCode: string;
}

/** Audio sintetizado de una replica. `null` cuando Polly no esta disponible. */
export interface CallTurnAudio {
  /** MP3 codificado en base64: un solo round-trip, sin storage ni URLs firmadas. */
  base64: string;
  contentType: 'audio/mpeg';
  /** Estimada por conteo de caracteres, no medida: anima el indicador de "hablando". */
  duracionMs: number;
}

/** Un turno de la llamada simulada: lo que dijo el closer + como respondio el lead. */
export interface CallTurn {
  indice: number;
  closerDijo: string;
  leadRespondio: string;
  /** `null` si `SPEECH_PROVIDER=none` o si Polly fallo: la UI cae a solo texto. */
  audio: CallTurnAudio | null;
  mood: CallMood;
  /** 0-100, acumulado. Sube o baja segun `temperature.ts`. */
  interes: number;
  objecionesPlanteadas: string[];
  objecionesResueltas: string[];
  /** Indices contra `BriefingSheet.talkingPoints` que este turno cubrio. */
  talkingPointsUsados: number[];
  ocurridoEn: IsoDateTime;
}

/**
 * Recorte SIN PII del `BriefingSheet`, para que el backend no dependa de
 * `LeadRepository` (los leads de la demo del front no existen ahi). Solo
 * primer nombre + atributos de perfil; nunca telefono ni apellidos.
 */
export interface PersonaContext {
  primerNombre: string;
  edad: number | null;
  ocupacion: string | null;
  ciudad: string | null;
  hogar: string | null;
  ingresosSmmlv: number | null;
  segmento: Segmento | null;
  motivacion: string | null;
  intereses: string[];
  citaTextual: string | null;
  objeciones: ObjecionSugerida[];
  talkingPoints: TalkingPoint[];
}

/** Sesion de llamada recien iniciada: el saludo del lead ya viene sintetizado. */
export interface CallSimulationSession {
  callId: string;
  leadId: string;
  dificultad: CallDifficulty;
  voz: SimulatedVoice;
  apertura: CallTurn;
  interes: number;
  iniciadaEn: IsoDateTime;
}

/**
 * Veredicto al colgar. Lo arma `verdict.ts` (dominio puro, testeado) a partir
 * de la sesion completa: es la pieza que responde "¿de verdad se cierra con
 * esta ficha?" ante el jurado con aritmetica auditable, no con la opinion de
 * un modelo.
 */
export interface CallScorecard {
  outcome: CallOutcome;
  puntaje: number;
  interesFinal: number;
  /** Interes turno a turno, para graficar la curva. */
  curvaInteres: number[];
  talkingPointsUsados: number[];
  talkingPointsIgnorados: number[];
  objecionesResueltas: string[];
  objecionesVivas: string[];
  duracionSegundos: number;
  turnos: number;
  explicacion: string;
  /**
   * Desglose del `puntaje`, mismo contrato de glass-box que `ScoreResult.factores`
   * (regla 12). Adenda A13.
   *
   * SIN ESTO el veredicto miente por omision: la UI mostraba un dial de "54"
   * al lado de la frase "interes final de 70/100" y no habia forma de saber
   * por que no coinciden — el puntaje mide al CLOSER (interes que logro +
   * guion que cubrio + objeciones que resolvio), no el interes del lead.
   */
  factores: Factor[];
  /** Incumplimientos detectados, p. ej. prometer "aprobado". Nunca vacio en falso. */
  alertas: string[];
  /**
   * Analisis redactado por el LLM (adenda A14). `null` cuando no se pudo
   * generar: el veredicto NUNCA depende de esto para mostrarse.
   */
  highlights: CallHighlights | null;
}

/**
 * Un tramo de voz del CLOSER, listo para transcribir. Adenda A12.
 *
 * PCM 16-bit con signo, little-endian, MONO. Ese formato y no un contenedor
 * (WebM/MP4) por dos razones: es lo que aceptan los motores de transcripcion
 * sin transcodificar, y es lo unico que todos los navegadores pueden producir
 * igual — `MediaRecorder` da WebM en Chrome/Edge/Firefox pero MP4 en Safari,
 * mientras que Web Audio API entrega las muestras crudas en todos.
 *
 * SIN PII: es la voz del comercial practicando, nunca la del titular. No se
 * persiste — se transcribe y se descarta en la misma request.
 */
export interface UtteranceAudio {
  /** Las muestras PCM codificadas en base64. */
  base64: string;
  /** Muestras por segundo, p. ej. 16000. El motor lo necesita explicito. */
  sampleRate: number;
}

/** Lo que el closer dijo, ya en texto. Vacio si no se entendio nada. */
export interface TranscriptionResult {
  texto: string;
}

/* ==========================================================================
 *  10.b F5 · grabacion y highlights de la llamada (adenda A14)
 * ========================================================================== */

/**
 * Que clase de hallazgo es. El front colorea y agrupa por esto, asi que es un
 * union cerrado y no un `string` libre.
 */
export type CallHighlightTipo =
  /** El turno donde el interes dio el mayor salto, y por que. */
  | 'momento_clave'
  /** Donde la conversacion se estanco o el interes cayo. */
  | 'momento_perdido'
  /** La frase del closer que mejor funciono, citada textual. */
  | 'acierto'
  /** El error mas costoso, con la alternativa concreta. */
  | 'error'
  /** Lo que el lead pidio y nunca recibio. Incluye peticiones fuera del guion. */
  | 'objecion_sin_resolver'
  /** Promesa indebida ("esta aprobado", "garantizado"), con el turno exacto. */
  | 'cumplimiento';

export interface CallHighlight {
  tipo: CallHighlightTipo;
  /** Titular corto, escaneable de un vistazo. */
  titulo: string;
  /** El detalle: que paso y por que importa. 1-3 frases. */
  detalle: string;
  /** Indice del `CallTurn` al que se refiere. `null` si es transversal. */
  turno: number | null;
  /** Cita TEXTUAL de ese turno. Es lo que hace verificable el hallazgo. */
  cita: string | null;
  /** Solo en `error` y `objecion_sin_resolver`: que decir la proxima vez. */
  sugerencia: string | null;
}

/**
 * Analisis redactado por el LLM sobre la transcripcion ya cerrada.
 *
 * Es un tipo aparte y no un `CallHighlight[]` suelto para poder trazar QUIEN
 * lo redacto: un analisis de hace dos semanas hecho por otro modelo no se
 * interpreta igual que el de hoy.
 */
export interface CallHighlights {
  items: CallHighlight[];
  /** Dos o tres frases de cierre para el closer. Lo unico que muchos leeran. */
  resumen: string;
  /** Modelo que lo redacto, p. ej. `deepseek-v4-flash`. Auditabilidad. */
  generadoPor: string;
  generadoEn: IsoDateTime;
}

/** Puntero al audio de UN turno dentro del bucket. Nunca una URL publica. */
export interface CallRecordingRef {
  turno: number;
  /** Quien habla: el comercial en entrenamiento o el lead simulado. */
  quien: 'closer' | 'lead';
  /** Ruta dentro del bucket. Se resuelve a URL firmada al reproducir. */
  path: string;
  /** `audio/pcm` para el closer (crudo), `audio/mpeg` para Polly. */
  contentType: 'audio/pcm' | 'audio/mpeg';
  /** Solo para el PCM del closer: sin esto el audio no se puede reproducir. */
  sampleRate: number | null;
}

/**
 * La llamada completa, tal como queda guardada. Es el registro historico:
 * permite volver a escuchar, releer y comparar entrenamientos.
 *
 * DATO PERSONAL: `grabaciones` apunta a la voz del COMERCIAL (no la del
 * titular — el lead es sintetico). Aun asi es un dato de una persona real y
 * por eso vive en un bucket privado, se sirve con URL firmada y nunca se
 * expone en un DTO publico.
 */
export interface CallRecord {
  callId: string;
  leadId: string;
  dificultad: CallDifficulty;
  /** La conversacion completa, turno a turno, SIN el audio embebido. */
  transcripcion: CallTurn[];
  scorecard: CallScorecard;
  /** `null` si el LLM no estaba disponible: el registro se guarda igual. */
  highlights: CallHighlights | null;
  grabaciones: CallRecordingRef[];
  iniciadaEn: IsoDateTime;
  terminadaEn: IsoDateTime;
}

/* ==========================================================================
 *  11. Datos calibrados (salida del pipeline offline de `analysis/`)
 * ========================================================================== */

/**
 * Pesos del scoring, calibrados contra los 4.142 compradores reales.
 * Target del entrenamiento: compro Y `fecha_desistimiento` vacia.
 *
 * REGLA DURA: `estrato` NO puede aparecer aqui. Los porcentajes de estrato del
 * dataset no suman 100%, asi que no es una variable dura (trampa de datos #2).
 */
export interface ScoringWeights {
  version: string;
  /** Nombre del factor -> peso. Suma esperada de |pesos| documentada en analysis/. */
  pesos: Record<string, number>;
  /** Umbral de `ScoreResult.valor` a partir del cual el lead es viable. */
  umbralViable: number;
  /** Metrica de calibracion (p. ej. AUC) para poder defenderla ante el jurado. */
  calibracion: { metrica: string; valor: number; n: number };
  generadoEn: IsoDateTime;
}

/** Zona comercial del proyecto. */
export type Zona = 'norte' | 'sur' | 'centro' | 'otra';

/** Buyer persona real de un proyecto, derivado del PPT + Excel. */
export interface ProjectProfile {
  proyectoId: string;
  nombre: string;
  ciudad: string;
  zona: Zona;
  precioDesde: COP;
  precioHasta: COP;
  /** `true` si el proyecto califica como Vivienda de Interes Social. */
  esVIS: boolean;
  /** Distribucion del comprador real. Nombre de atributo -> valor -> proporcion. */
  perfilComprador: Record<string, Record<string, number>>;
  /** Proporcion de compradores afiliados. Insumo de la regla 90/10. */
  proporcionAfiliados: number;
  /**
   * `true` solo cuando `perfilComprador` y `proporcionAfiliados` salieron del
   * pipeline de `analysis/` contra el Excel de los 4.142 compradores reales.
   *
   * Mientras sea `false`, las distribuciones son una heuristica razonada a mano
   * (ver `_aviso` en `data/project_profiles.json`) y NADIE puede afirmar
   * "el 87% de los compradores de X comparten tu segmento": esa frase suena a
   * dato duro y seria una estadistica inventada sobre personas que no existen.
   */
  perfilCalibrado: boolean;
}

/** Una tipologia de apartamento publicada en el brochure. */
export interface Tipologia {
  nombre: string;
  /** Area construida en m2, tal como la publica el brochure. */
  areaConstruida: number;
  areaPrivada: number | null;
  habitaciones: number;
  banos: number;
  /** Precio publicado por el constructor, en SMMLV. `null` si no lo publica. */
  precioSMMLV: number | null;
}

/**
 * Banda de precio de un proyecto (adenda A8).
 *
 * `esEstimado` OBLIGA a la UI: si es `true`, el numero se rotula como estimado
 * y jamas como oferta. 15 de los 16 brochures no publican precio y dicen
 * explicitamente que el valor definitivo es el de la promesa de compraventa.
 * `metodo` existe para poder responderle a un jurado que pregunte de donde
 * salio la cifra.
 */
export interface PriceBand {
  desde: COP;
  /** `null` en proyectos NO VIS: no tienen techo regulado. */
  hasta: COP | null;
  esEstimado: boolean;
  metodo: string;
}

/**
 * Ficha comercial de un proyecto (adenda A8).
 *
 * Sale de `data/projects_catalog.json`, que genera
 * `analysis/scripts/06_build_projects_catalog.py` transcribiendo los brochures
 * publicos enlazados por la organizacion. SIN scraping de portales.
 *
 * Es la cara visible del proyecto; `ProjectProfile` es su buyer persona. No se
 * fusionan: tienen fuente, cadencia y nivel de confianza distintos.
 */
export interface ProjectCard {
  proyectoId: string;
  nombre: string;
  /** Sector comercial, p. ej. `Ciudadela Colsubsidio Maipore`. */
  ubicacion: string;
  ciudad: string;
  zona: Zona;
  esVIS: boolean;
  descripcion: string;
  unidades: number | null;
  torres: number | null;
  /** Texto libre: los brochures describen los pisos de formas distintas. */
  pisos: string | null;
  areaDesde: number;
  /** `null` cuando el proyecto publica una sola tipologia. */
  areaHasta: number | null;
  habitacionesDesde: number;
  habitacionesHasta: number;
  tipologias: Tipologia[];
  amenidades: string[];
  lugaresCercanos: string[];
  entrega: string | null;
  certificacionEdge: boolean;
  salaDeVentas: string | null;
  /** Brochure publico del proyecto. Se abre en pestana nueva. */
  brochureUrl: string;
  /** Render extraido del brochure, servido por el frontend desde `public/`. */
  imagen: string;
  precio: PriceBand;
}

/* ==========================================================================
 *  12. Envoltura de API — acuerdo backend <-> frontend
 * ========================================================================== */

export interface ApiError {
  code: string;
  message: string;
  /** Errores de validacion por campo. Nunca incluir stack traces (OWASP). */
  fields: Record<string, string> | null;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Rutas de la API. Fuente de verdad unica para que el front no invente URLs.
 * `/api/leads/*` es publico (usuario final, sin login).
 * `/api/closer/*` esta detras del guard de rol closer.
 */
export const API_ROUTES = {
  health: '/api/health',
  intake: {
    start: '/api/leads/intake/start',
    turn: '/api/leads/intake/turn',
    consent: '/api/leads/intake/consent',
  },
  enrichment: {
    start: '/api/leads/enrichment/start',
    turn: '/api/leads/enrichment/turn',
    /** Baraja de proyectos afines al lead viable (adenda A9). */
    deck: '/api/leads/enrichment/deck',
    /** Registra una decision sobre una tarjeta. */
    swipe: '/api/leads/enrichment/swipe',
    /** Cierra F2.1 y persiste el lead enriquecido. */
    summary: '/api/leads/enrichment/summary',
    /** Recibe el lote de telemetria de atencion de la sesion (adenda A10). */
    telemetry: '/api/leads/enrichment/telemetry',
  },
  education: {
    journey: '/api/leads/education/journey',
    progress: '/api/leads/education/progress',
  },
  closer: {
    login: '/api/closer/auth/login',
    logout: '/api/closer/auth/logout',
    session: '/api/closer/auth/session',
    leads: '/api/closer/leads',
    briefing: '/api/closer/leads/briefing',
    /** F5 · llamada simulada de entrenamiento. Adenda A11. */
    call: {
      start: '/api/closer/leads/call/start',
      turn: '/api/closer/leads/call/turn',
      end: '/api/closer/leads/call/end',
      /** Voz del closer -> texto. Nuestra, no la del navegador (adenda A12). */
      transcribe: '/api/closer/leads/call/transcribe',
    },
    /** Revela el telefono real. Accion auditada (F4). Adenda A8. */
    revealContact: '/api/closer/leads/reveal-contact',
  },
} as const;
