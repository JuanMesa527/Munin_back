/**
 * Boveda de contacto sobre Supabase. Capa: infrastructure (adapter de
 * `ContactVaultPort`).
 *
 * MISMO CONTRATO que `InMemoryContactVaultAdapter`, distinto respaldo. La de
 * memoria sirve para tests y para correr sin base de datos; esta es la que
 * aguanta un reinicio, que es justo lo que fallaba: cada deploy vaciaba el Map
 * y el `contactoTokenId` guardado dentro del lead dejaba de resolver, asi que
 * "revelar contacto" moria con NotFound para todos los leads anteriores.
 *
 * MINIMIZACION (Ley 1581, art. 4): el telefono real vive SOLO en
 * `contact_vault`. Lo que circula en DTOs es `ContactIdentity` con el telefono
 * enmascarado y el token opaco. El dato real se resuelve unicamente en
 * `revealForCall`, con closer identificado y SIEMPRE con registro de auditoria.
 */

import type { ContactIdentity } from '@contracts';
import type { AuditLogPort } from '../../application/ports/audit-log.port.js';
import type { ClockPort } from '../../application/ports/clock.port.js';
import type { ContactVaultPort } from '../../application/ports/contact-vault.port.js';
import type { IdGeneratorPort } from '../../application/ports/id-generator.port.js';
import { maskPhone } from '../../domain/phone.js';
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from '../../kernel/errors.js';
import type { Result } from '../../kernel/result.js';
import { err, ok } from '../../kernel/result.js';
import { logger } from '../logging/logger.js';
import type { AppSupabaseClient } from '../persistence/supabase/supabase-client.js';

const TABLA = 'contact_vault';

/** Un movil colombiano tiene 10 digitos; con indicativo, 12. */
const MINIMO_DIGITOS_TELEFONO = 7;

const ACCION_AUDITADA = 'revelar_contacto';

export interface SupabaseContactVaultDeps {
  readonly client: AppSupabaseClient;
  readonly ids: IdGeneratorPort;
  readonly clock: ClockPort;
  readonly audit: AuditLogPort;
}

export class SupabaseContactVaultAdapter implements ContactVaultPort {
  constructor(private readonly deps: SupabaseContactVaultDeps) {}

  async store(input: { nombre: string; telefono: string }): Promise<Result<ContactIdentity>> {
    const nombre = input.nombre.trim();
    const digitos = input.telefono.replace(/\D/gu, '');

    if (nombre.length === 0) {
      return err(new ValidationError('Falta el nombre del lead', { nombre: 'requerido' }));
    }
    if (digitos.length < MINIMO_DIGITOS_TELEFONO) {
      return err(new ValidationError('El telefono no parece valido', { telefono: 'incompleto' }));
    }

    const contactoTokenId = this.deps.ids.newId();

    try {
      const { error } = await this.deps.client
        .from(TABLA)
        .insert({ token_id: contactoTokenId, telefono: input.telefono });

      if (error) {
        // NUNCA se loguea el telefono, ni siquiera al fallar: solo el codigo.
        logger.error({ operacion: 'vault.store', codigo: error.code }, 'no se pudo guardar el contacto');
        return err(new InfrastructureError('No se pudo guardar el contacto'));
      }
    } catch {
      logger.error({ operacion: 'vault.store' }, 'no se pudo guardar el contacto');
      return err(new InfrastructureError('No se pudo guardar el contacto'));
    }

    return ok({
      // Solo el nombre de pila: el contrato prohibe arrastrar apellidos, y
      // menos datos guardados es menos dato que proteger.
      nombre: primerNombre(nombre),
      telefonoEnmascarado: maskPhone(input.telefono),
      contactoTokenId,
    });
  }

  /**
   * Resuelve el telefono real. SIEMPRE audita, en los cuatro caminos: el
   * registro de los accesos DENEGADOS es el que demuestra que el control
   * existe (trazabilidad exigible a una entidad Vigilada Supersubsidio).
   */
  async revealForCall(tokenId: string, closerId: string): Promise<Result<{ telefono: string }>> {
    if (closerId.trim().length === 0) {
      await this.auditar(closerId, tokenId, 'denegado');
      return err(new ForbiddenError('Se requiere un closer identificado para revelar el contacto'));
    }

    let telefono: string | null = null;
    try {
      const { data, error } = await this.deps.client
        .from(TABLA)
        .select('telefono')
        .eq('token_id', tokenId)
        .maybeSingle();

      if (error) {
        await this.auditar(closerId, tokenId, 'denegado');
        logger.error({ operacion: 'vault.reveal', codigo: error.code }, 'no se pudo leer el contacto');
        return err(new InfrastructureError('No se pudo leer el contacto'));
      }
      telefono = data?.telefono ?? null;
    } catch {
      await this.auditar(closerId, tokenId, 'denegado');
      logger.error({ operacion: 'vault.reveal' }, 'no se pudo leer el contacto');
      return err(new InfrastructureError('No se pudo leer el contacto'));
    }

    if (telefono === null) {
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
