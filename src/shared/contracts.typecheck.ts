import type { EnrichmentSessionSummary, SwipeEvent, ViewEvent } from './contracts.js';

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;

type Assert<Condition extends true> = Condition;

type RequiredKeys<Value> = {
  [Key in keyof Value]-?: object extends Pick<Value, Key> ? never : Key;
}[keyof Value];

export type SwipeEventHasExactKeys = Assert<
  Equal<
    keyof SwipeEvent,
    'leadId' | 'proyectoId' | 'accion' | 'decididoEn' | 'dwellMs' | 'abrioDetalle' | 'detalleMs'
  >
>;

export type SwipeEventHasOnlyRequiredFields = Assert<
  Equal<RequiredKeys<SwipeEvent>, keyof SwipeEvent>
>;

export type ViewEventHasExactKeys = Assert<
  Equal<keyof ViewEvent, 'leadId' | 'proyectoId' | 'seccion' | 'dwellMs' | 'ocurridoEn'>
>;

export type ViewEventHasOnlyRequiredFields = Assert<
  Equal<RequiredKeys<ViewEvent>, keyof ViewEvent>
>;

export type SessionSummaryHasExactKeys = Assert<
  Equal<
    keyof EnrichmentSessionSummary,
    | 'leadId'
    | 'startedAt'
    | 'endedAt'
    | 'totalTarjetas'
    | 'decididas'
    | 'likes'
    | 'favoritos'
    | 'passes'
    | 'intentScore'
    | 'tiempoTotalMs'
  >
>;

export type SessionSummaryHasOnlyRequiredFields = Assert<
  Equal<RequiredKeys<EnrichmentSessionSummary>, keyof EnrichmentSessionSummary>
>;
