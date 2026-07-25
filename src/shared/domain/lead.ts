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
import { SLOTS } from '@contracts';

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
 * Gate legal (Ley 1581 de 2012): consentimiento previo, expreso e INFORMADO.
 * `domain/` no puede leer `env`, asi que la version vigente de la politica
 * llega como parametro — la inyecta `application/` desde `env.privacyPolicyVersion`
 * (design.md D2). Si el titular acepto un texto de politica distinto al vigente,
 * no cuenta como consentimiento valido.
 */
export function hasConsent(profile: LeadProfile, activePolicyVersion: string): boolean {
  if (profile.consentimiento === null) {
    return false;
  }
  return (
    profile.consentimiento.otorgado &&
    profile.consentimiento.versionPolitica === activePolicyVersion
  );
}

/** `SLOTS` menos `profile.slotsLlenos`, preservando el orden de `SLOTS`. */
export function missingSlots(profile: LeadProfile): Slot[] {
  return SLOTS.filter((slot) => !profile.slotsLlenos.includes(slot));
}

/**
 * Un slot esta lleno cuando aparece en `slotsLlenos` Y su campo tiene valor.
 * La doble comprobacion existe porque `slotsLlenos` es un indice y los
 * indices se desincronizan: si el campo quedo en `null` por alguna razon,
 * el slot NO cuenta como lleno aunque el indice diga lo contrario.
 */
export function isSlotFilled(profile: LeadProfile, slot: Slot): boolean {
  if (!profile.slotsLlenos.includes(slot)) {
    return false;
  }
  return slotFieldValue(profile, slot) !== null;
}

/** Traduce un `Slot` al valor crudo del campo correspondiente en `LeadProfile`. */
function slotFieldValue(profile: LeadProfile, slot: Slot): unknown {
  switch (slot) {
    case 'afiliacion':
      return profile.esAfiliado;
    case 'rangoSalarial':
      return profile.rangoSalarial;
    case 'segmento':
      return profile.segmento;
    case 'personasACargo':
      return profile.personasACargo;
    case 'ciudad':
      return profile.ciudad;
    case 'segmentoFamiliar':
      return profile.segmentoFamiliar;
    case 'ahorro':
      return profile.ahorroDeclarado;
    case 'capacidadAhorroMensual':
      return profile.capacidadAhorroMensual;
  }
}
