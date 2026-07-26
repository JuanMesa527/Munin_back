/**
 * Puerto de busqueda inversa telefono/email -> leadId. Capa: application
 * (puerto compartido). Existe SOLO para el login por OTP del lead (F2.2): sin
 * el, la unica forma de identificar un lead es tener su `leadId` a mano
 * (`localStorage`), y si el usuario cierra la pestana y lo pierde no hay forma
 * de volver a su recorrido.
 *
 * Deliberadamente SEPARADO de `LeadRepository`: agregar aqui un metodo mas no
 * toca el puerto que ya consumen F1/F2.1/F3/F4, ni sus dobles de test.
 */

import type { Result } from '../../kernel/result.js';

export interface LeadContactInput {
  readonly telefono: string | null;
  readonly email: string | null;
}

export interface LeadContactLookupPort {
  /**
   * Resuelve el `leadId` dueno de un telefono o email. El mismo
   * `NotFoundError` cubre "no existe" y "campo vacio": distinguirlos
   * permitiria enumerar que telefonos/emails estan registrados (OWASP A07).
   */
  findLeadIdByContact(contact: LeadContactInput): Promise<Result<string>>;
  /**
   * Direccion inversa: el contacto que F1 ya le capturo a un lead. La usa el
   * GATE de F2.2 — el lead acaba de salir de la conversacion, tenemos su
   * `leadId` pero no su correo, y el codigo hay que mandarlo a ALGUN lado.
   * Sin esto habria que pedirle otra vez el correo que acaba de escribir.
   */
  findContactByLeadId(leadId: string): Promise<Result<LeadContactInput>>;
}
