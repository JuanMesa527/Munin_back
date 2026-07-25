/**
 * Boveda de contacto en memoria. Capa: infrastructure (adapter de `ContactVaultPort`).
 *
 * MINIMIZACION DE DATOS (Ley 1581 de 2012, art. 4): el telefono real vive SOLO
 * en el mapa privado de esta clase. Lo que sale de aqui hacia cualquier DTO es
 * `ContactIdentity` con el telefono enmascarado y un token opaco. El dato real
 * se resuelve unicamente en `revealForCall`, con closer identificado y registro
 * en auditoria.
 *
 * En produccion este mapa es un almacen cifrado (KMS + cifrado en reposo); la
 * INTERFAZ ya es la correcta, lo que cambia es el respaldo.
 */

import type { ContactIdentity } from '@contracts';
import type { AuditLogPort } from '../../application/ports/audit-log.port.js';
import type { ClockPort } from '../../application/ports/clock.port.js';
import type { ContactVaultPort } from '../../application/ports/contact-vault.port.js';
import type { IdGeneratorPort } from '../../application/ports/id-generator.port.js';
import { maskPhone } from '../../domain/phone.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../kernel/errors.js';
import type { Result } from '../../kernel/result.js';
import { err, ok } from '../../kernel/result.js';

export { maskPhone } from '../../domain/phone.js';

/** Un movil colombiano tiene 10 digitos; con indicativo, 12. */
const MINIMO_DIGITOS_TELEFONO = 7;

const ACCION_AUDITADA = 'revelar_contacto';

export interface InMemoryContactVaultDeps {
  readonly ids: IdGeneratorPort;
  readonly clock: ClockPort;
  readonly audit: AuditLogPort;
}

export class InMemoryContactVaultAdapter implements ContactVaultPort {
  /** Clave = `contactoTokenId`. Valor = el dato personal real. */
  private readonly telefonos = new Map<string, string>();

  constructor(private readonly deps: InMemoryContactVaultDeps) {}

  store(input: { nombre: string; telefono: string }): Promise<Result<ContactIdentity>> {
    const nombre = input.nombre.trim();
    const digitos = input.telefono.replace(/\D/gu, '');

    if (nombre.length === 0) {
      return Promise.resolve(
        err(new ValidationError('Falta el nombre del lead', { nombre: 'requerido' })),
      );
    }
    if (digitos.length < MINIMO_DIGITOS_TELEFONO) {
      return Promise.resolve(
        err(new ValidationError('El telefono no parece valido', { telefono: 'incompleto' })),
      );
    }

    const contactoTokenId = this.deps.ids.newId();
    this.telefonos.set(contactoTokenId, input.telefono);

    return Promise.resolve(
      ok({
        // Solo el nombre de pila: el contrato prohibe arrastrar apellidos, y
        // menos datos guardados es menos dato que proteger.
        nombre: primerNombre(nombre),
        telefonoEnmascarado: maskPhone(input.telefono),
        contactoTokenId,
      }),
    );
  }

  /**
   * Resuelve el telefono real. SIEMPRE audita, en los tres caminos, porque el
   * registro de los accesos DENEGADOS es justamente el que demuestra que el
   * control existe (trazabilidad exigible a una entidad Vigilada Supersubsidio).
   *
   * `closerId` tiene que venir de una sesion ya verificada por `requireCloser`,
   * nunca del body del cliente: si no, cualquiera se declara closer (OWASP A01).
   */
  async revealForCall(tokenId: string, closerId: string): Promise<Result<{ telefono: string }>> {
    if (closerId.trim().length === 0) {
      await this.auditar(closerId, tokenId, 'denegado');
      return err(new ForbiddenError('Se requiere un closer identificado para revelar el contacto'));
    }

    const telefono = this.telefonos.get(tokenId);
    if (telefono === undefined) {
      await this.auditar(closerId, tokenId, 'denegado');
      return err(new NotFoundError('No hay un contacto asociado a ese token'));
    }

    await this.auditar(closerId, tokenId, 'permitido');
    // El telefono viaja de vuelta al caso de uso, jamas al log: el logger
    // redacta `*.telefono` como segunda barrera.
    return ok({ telefono });
  }

  private async auditar(
    closerId: string,
    tokenId: string,
    resultado: 'permitido' | 'denegado',
  ): Promise<void> {
    await this.deps.audit.record({
      actorId: closerId,
      accion: ACCION_AUDITADA,
      recursoId: tokenId,
      resultado,
      ocurridoEn: this.deps.clock.now(),
    });
  }
}

function primerNombre(nombreCompleto: string): string {
  const partes = nombreCompleto.split(/\s+/u);
  return partes[0] ?? nombreCompleto;
}
