/**
 * Tipos minimos del schema de Supabase que toca el backend. Capa: infrastructure.
 *
 * No es el archivo generado por `supabase gen types` (ese trae todo el schema):
 * es a mano y solo cubre las tablas que los adapters escriben/leen, para que
 * `client.from('x').insert(...)` tipe la fila en vez de resolver a `never` (que
 * es lo que pasa con un cliente sin `Database`). Si cambia el schema
 * (`supabase/migrations/`), actualizar aqui.
 */

/* eslint-disable @typescript-eslint/consistent-type-definitions --
 * Las filas van como `type`, NO `interface`, a proposito: una `interface` no es
 * asignable a `Record<string, unknown>` (TS no le da indice implicito) y el
 * `GenericSchema` de supabase-js lo exige. Con `interface` el schema colapsa a
 * `never` y todo insert/upsert termina pidiendo `never[]`. */

type Timestamptz = string;

// OJO: filas como `type`, NO `interface`. Una `interface` no es asignable a
// `Record<string, unknown>` (TS no le da indice implicito), y `GenericSchema`
// de supabase-js lo exige; con `interface` el schema colapsa a `never` y todo
// insert/upsert pide `never[]`.
type SwipeEventsRow = {
  id: string;
  lead_id: string;
  proyecto_id: string;
  accion: string;
  similitud: number | null;
  razon: string | null;
  cabe_en_capacidad: boolean | null;
  // jsonb de solo-escritura desde el adapter. `unknown` en vez de `Json` porque
  // `Factor` es una interface del contrato y no calza en el `Json` recursivo
  // (le falta el indice de string), y aqui no se re-lee esta columna.
  factores: unknown;
  dwell_ms: number | null;
  abrio_detalle: boolean;
  detalle_ms: number | null;
  decidido_en: Timestamptz;
  created_at: Timestamptz;
};

type ViewEventsRow = {
  id: string;
  lead_id: string;
  proyecto_id: string | null;
  seccion: string;
  dwell_ms: number;
  ocurrido_en: Timestamptz;
  created_at: Timestamptz;
};

type EnrichmentSessionsRow = {
  id: string;
  lead_id: string;
  started_at: Timestamptz | null;
  ended_at: Timestamptz | null;
  total_tarjetas: number | null;
  decididas: number | null;
  likes: number | null;
  favoritos: number | null;
  passes: number | null;
  intent_score: number | null;
  tiempo_total_ms: number | null;
  dispositivo: string | null;
  viewport: string | null;
  created_at: Timestamptz;
};

type LeadProfilesRow = {
  lead_id: string;
  base_payload: unknown;
  enriched_payload: unknown;
  carril: string | null;
  score: number | null;
  intent_score: number | null;
  updated_at: Timestamptz;
};

/** F5 · una llamada de entrenamiento terminada (adenda A14). */
type CallSessionsRow = {
  id: string;
  lead_id: string;
  dificultad: string;
  outcome: string;
  puntaje: number;
  interes_final: number;
  turnos: number;
  duracion_segundos: number;
  // jsonb de solo-escritura, mismo criterio que `factores` arriba: los tipos
  // del contrato son interfaces y no calzan en el `Json` recursivo.
  transcripcion: unknown;
  scorecard: unknown;
  highlights: unknown;
  grabaciones: unknown;
  iniciada_en: Timestamptz;
  terminada_en: Timestamptz;
  creado_en: Timestamptz;
};

/**
 * Boveda de contacto. Guarda el UNICO telefono real que persiste el sistema,
 * separado de `lead_profiles` para que el dato sensible tenga su propia tabla,
 * su propio RLS y se pueda borrar solo (derecho de supresion, Ley 1581).
 */
type ContactVaultRow = {
  token_id: string;
  telefono: string;
  creado_en: Timestamptz;
};

/** Los `id`/`created_at` los pone la base (default): opcionales al insertar. */
type Insertable<T extends { id: string; created_at: Timestamptz }> = Omit<
  T,
  'id' | 'created_at'
> & { id?: string; created_at?: Timestamptz };

export interface Database {
  public: {
    Tables: {
      swipe_events: {
        Row: SwipeEventsRow;
        Insert: Insertable<SwipeEventsRow> & { abrio_detalle?: boolean };
        Update: Partial<Insertable<SwipeEventsRow>>;
        Relationships: [];
      };
      view_events: {
        Row: ViewEventsRow;
        Insert: Insertable<ViewEventsRow>;
        Update: Partial<Insertable<ViewEventsRow>>;
        Relationships: [];
      };
      enrichment_sessions: {
        Row: EnrichmentSessionsRow;
        Insert: Insertable<EnrichmentSessionsRow>;
        Update: Partial<Insertable<EnrichmentSessionsRow>>;
        Relationships: [];
      };
      contact_vault: {
        Row: ContactVaultRow;
        Insert: Omit<ContactVaultRow, 'creado_en'> & { creado_en?: Timestamptz };
        Update: Partial<ContactVaultRow>;
        Relationships: [];
      };
      lead_profiles: {
        Row: LeadProfilesRow;
        Insert: Omit<LeadProfilesRow, 'enriched_payload' | 'intent_score' | 'updated_at'> & {
          enriched_payload?: unknown;
          intent_score?: number | null;
          updated_at?: Timestamptz;
        };
        Update: Partial<LeadProfilesRow>;
        Relationships: [];
      };
      call_sessions: {
        // `id` lo pone el backend (es el `callId` de la sesion) y `creado_en`
        // la base: por eso no usa `Insertable`, que asume `created_at`.
        Row: CallSessionsRow;
        Insert: Omit<CallSessionsRow, 'creado_en'> & { creado_en?: Timestamptz };
        Update: Partial<Omit<CallSessionsRow, 'creado_en'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
