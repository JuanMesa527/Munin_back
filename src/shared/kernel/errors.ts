/**
 * Errores de dominio: fallos ESPERADOS del negocio, con codigo estable que el
 * frontend puede ramificar. Capa: kernel (dominio purisimo, sin HTTP).
 *
 * El mapeo codigo -> status HTTP vive en `infrastructure/http/api-response.ts`:
 * el dominio no conoce Express. El `message` viaja al cliente, asi que nunca
 * debe contener PII, rutas de archivos ni detalles internos (OWASP A09).
 */

/**
 * Codigos en SCREAMING_SNAKE. Son parte del contrato con el frontend: cambiar
 * uno rompe consumidores, igual que cambiar `contracts.ts`.
 */
export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  notFound: 'NOT_FOUND',
  forbidden: 'FORBIDDEN',
  unauthorized: 'UNAUTHORIZED',
  consentRequired: 'CONSENT_REQUIRED',
  conflict: 'CONFLICT',
  dataUnavailable: 'DATA_UNAVAILABLE',
} as const;

/** Errores por campo, tal como los espera `ApiError.fields` del contrato. */
export type ErrorFields = Record<string, string> | null;

export class DomainError extends Error {
  readonly code: string;
  readonly fields: ErrorFields;

  constructor(code: string, message: string, fields: ErrorFields = null) {
    super(message);
    // `new.target.name` deja el nombre de la subclase en los logs sin repetirlo
    // a mano en cada constructor.
    this.name = new.target.name;
    this.code = code;
    this.fields = fields;
  }
}

/** Entrada invalida detectada en el borde (zod) o en una regla de dominio. */
export class ValidationError extends DomainError {
  constructor(message = 'Datos de entrada no validos', fields: ErrorFields = null) {
    super(ERROR_CODES.validation, message, fields);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Recurso no encontrado', fields: ErrorFields = null) {
    super(ERROR_CODES.notFound, message, fields);
  }
}

/** Autenticado pero sin permiso. Distinto de `UnauthorizedError` a proposito. */
export class ForbiddenError extends DomainError {
  constructor(message = 'No tienes permiso para esta operacion', fields: ErrorFields = null) {
    super(ERROR_CODES.forbidden, message, fields);
  }
}

/**
 * Sin sesion valida. El mensaje es deliberadamente vago: no revelamos si el
 * token no existe, expiro o fue revocado (OWASP A07, enumeracion de sesiones).
 */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Sesion no valida', fields: ErrorFields = null) {
    super(ERROR_CODES.unauthorized, message, fields);
  }
}

/**
 * Gate legal: la Ley 1581 de 2012 exige consentimiento previo, expreso e
 * informado ANTES de tratar datos personales. Sin el, la tuberia no perfila.
 */
export class ConsentRequiredError extends DomainError {
  constructor(
    message = 'Se requiere el consentimiento del titular antes de tratar sus datos',
    fields: ErrorFields = null,
  ) {
    super(ERROR_CODES.consentRequired, message, fields);
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'El recurso ya existe o cambio de estado', fields: ErrorFields = null) {
    super(ERROR_CODES.conflict, message, fields);
  }
}

/**
 * Los datos calibrados de `data/` no estan listos (archivo ausente, corrupto o
 * todavia marcado como placeholder). No es culpa del cliente: es 503.
 */
export class InfrastructureError extends DomainError {
  constructor(message = 'El servicio de datos no esta disponible', fields: ErrorFields = null) {
    super(ERROR_CODES.dataUnavailable, message, fields);
  }
}

export class DataUnavailableError extends InfrastructureError {
  constructor(
    message = 'Los datos calibrados no estan disponibles todavia',
    fields: ErrorFields = null,
  ) {
    super(message, fields);
  }
}

/** Guard para el manejador de errores de Express, que recibe `unknown`. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
