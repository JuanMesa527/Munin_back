/**
 * Generador de ids. Capa: infrastructure (adapter de `IdGeneratorPort`).
 * `randomUUID` de `node:crypto` usa el CSPRNG del sistema: los ids de lead y los
 * tokens de contacto son imposibles de adivinar o enumerar (OWASP A01, acceso
 * por referencia directa a objetos).
 */

import { randomUUID } from 'node:crypto';
import type { IdGeneratorPort } from '../../application/ports/id-generator.port.js';

export class CryptoIdGenerator implements IdGeneratorPort {
  newId(): string {
    return randomUUID();
  }
}
