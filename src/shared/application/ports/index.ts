/**
 * Barrel de los puertos compartidos. Capa: application.
 * Es la superficie por la que las features se hablan entre si sin importar
 * internals ajenos (regla 4): o `@contracts`, o un puerto de aqui.
 */

export * from './audit-log.port.js';
export * from './clock.port.js';
export * from './closer-auth.port.js';
export * from './contact-vault.port.js';
export * from './data-catalog.port.js';
export * from './education-repository.port.js';
export * from './id-generator.port.js';
export * from './lead-auth.port.js';
export * from './lead-contact-lookup.port.js';
export * from './lead-otp-delivery.port.js';
export * from './lead-repository.port.js';
export * from './llm.port.js';
