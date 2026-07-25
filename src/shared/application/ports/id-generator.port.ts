/**
 * Puerto de generacion de identificadores. Capa: application (puerto compartido).
 * Los ids del dominio son opacos: nunca se derivan de un dato personal (cedula,
 * telefono, correo), porque un id derivado filtra PII a cualquiera que lo vea.
 */

export interface IdGeneratorPort {
  newId(): string;
}
