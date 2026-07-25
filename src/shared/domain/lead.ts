/**
 * Helpers puros sobre `LeadProfile`. Capa: domain compartido (puro, sin I/O).
 * Viven aqui y no dentro de una feature porque los usan F1 (intake), F2.1
 * (enrichment) y F2.2 (education): compartirlos por `@shared/domain` es lo que
 * evita que una feature importe internals de otra (regla 4).
 *
 * Convencion de scaffolding: un parametro con prefijo `_` significa "el cuerpo
 * todavia es un stub"; quita el `_` al implementar.
 */

import type { IsoDateTime, LeadProfile, Slot } from '@contracts';

/**
 * Perfil vacio y valido. Todo `null` salvo las colecciones, que arrancan
 * vacias: modelamos "todavia no lo se" como `null` y nunca como `0` o `''`,
 * porque un `0` en `ahorroDeclarado` SI es un dato y cambia el score.
 *
 * Implementado (no stub) porque lo necesita cualquier caso de uso que cree un
 * lead, y porque un perfil mal inicializado es la fuente #1 de bugs sutiles.
 */
export function createEmptyLeadProfile(id: string, now: IsoDateTime): LeadProfile {
  return {
    id,
    consentimiento: null,
    identidad: null,
    esAfiliado: null,
    rangoSalarial: null,
    segmento: null,
    personasACargo: null,
    ciudad: null,
    segmentoFamiliar: null,
    ahorroDeclarado: null,
    capacidadAhorroMensual: null,
    slotsLlenos: [],
    capacidad: null,
    score: null,
    proyectos: [],
    carril: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * TODO(F1): gate legal, no un simple null-check.
 * Debe exigir `consentimiento.otorgado === true`, que `finalidades` incluya
 * `perfilamiento_vivienda` y que `versionPolitica` sea la vigente
 * (`env.privacyPolicyVersion`). Ley 1581 de 2012: consentimiento previo,
 * expreso e INFORMADO — si el titular acepto otro texto, no vale.
 */
export function hasConsent(_profile: LeadProfile): boolean {
  throw new Error('TODO: not implemented');
}

/** TODO(F1): `SLOTS` menos `profile.slotsLlenos`, preservando el orden de `SLOTS`. */
export function missingSlots(_profile: LeadProfile): Slot[] {
  throw new Error('TODO: not implemented');
}

/**
 * TODO(F1): un slot esta lleno cuando aparece en `slotsLlenos` Y su campo tiene
 * valor. La doble comprobacion existe porque `slotsLlenos` es un indice y los
 * indices se desincronizan.
 */
export function isSlotFilled(_profile: LeadProfile, _slot: Slot): boolean {
  throw new Error('TODO: not implemented');
}
