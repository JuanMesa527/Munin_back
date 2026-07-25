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

/** Los 8 datos que la conversacion de F1 tiene que llenar. */
export type Slot =
  | 'afiliacion'
  | 'rangoSalarial'
  | 'segmento'
  | 'personasACargo'
  | 'ciudad'
  | 'segmentoFamiliar'
  | 'ahorro'
  | 'capacidadAhorroMensual';

export const SLOTS: readonly Slot[] = [
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
  | 'perfilamiento_vivienda'
  | 'contacto_comercial'
  | 'educacion_financiera';

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
}

/* ==========================================================================
 *  4. LeadProfile — el objeto central que viaja por toda la tuberia
 * ========================================================================== */

export interface LeadProfile {
  id: string;

  /** Gate legal. Se captura ANTES de cualquier pregunta de perfilamiento. */
  consentimiento: ConsentRecord | null;

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
export type TipoHito =
  | 'ingreso'
  | 'consentimiento'
  | 'perfilamiento'
  | 'nutricion'
  | 'viable';

/** Evento del recorrido del lead. Adenda A8. */
export interface LeadTimelineEvent {
  label: string;
  /** Ya formateada para mostrar: el backend conoce la zona horaria, el front no. */
  fecha: string;
  hito: TipoHito;
}

export interface EnrichedLead extends LeadProfile {
  /** Identidad minima para que el closer pueda llamar (ver adenda A2). */
  identidad: ContactIdentity | null;
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
 *  7. F2.2 · lead-education (gamificado)
 * ========================================================================== */

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
  actualizadoEn: IsoDateTime;
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

export type LeadListSort =
  | 'score_desc'
  | 'capacidad_desc'
  | 'intent_desc'
  | 'recencia_desc';

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
 *  10. Datos calibrados (salida del pipeline offline de `analysis/`)
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

/** Buyer persona real de un proyecto, derivado del PPT + Excel. */
export interface ProjectProfile {
  proyectoId: string;
  nombre: string;
  ciudad: string;
  zona: 'norte' | 'sur' | 'centro' | 'otra';
  precioDesde: COP;
  precioHasta: COP;
  /** `true` si el proyecto califica como Vivienda de Interes Social. */
  esVIS: boolean;
  /** Distribucion del comprador real. Nombre de atributo -> valor -> proporcion. */
  perfilComprador: Record<string, Record<string, number>>;
  /** Proporcion de compradores afiliados. Insumo de la regla 90/10. */
  proporcionAfiliados: number;
}

/* ==========================================================================
 *  11. Envoltura de API — acuerdo backend <-> frontend
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
    call: '/api/closer/leads/call',
    /** Revela el telefono real. Accion auditada (F4). Adenda A8. */
    revealContact: '/api/closer/leads/reveal-contact',
  },
} as const;
