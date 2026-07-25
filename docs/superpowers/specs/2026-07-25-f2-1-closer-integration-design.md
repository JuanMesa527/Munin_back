# Integración F2.1 → F3/F4

Fecha: 2026-07-25

## Objetivo

Conectar los leads enriquecidos por F2.1 con la lista F3 y el briefing F4 que ya consume el frontend. La entrega incluye persistencia durable en Supabase, fallback en memoria para desarrollo y pruebas, autenticación del closer y revelado auditado del contacto.

F1 y F2.2 quedan fuera de este alcance.

## Arquitectura

`src/app.ts` continúa como único composition root. Selecciona adapters concretos según `PERSISTENCE_DRIVER`, construye los módulos y monta los middleware en este orden:

1. Seguridad, CORS, parser JSON y logging.
2. Health check.
3. Rutas públicas de F2.1 con rate limit público.
4. Login closer con rate limit de autenticación.
5. Rutas F3/F4 protegidas por sesión.
6. Handlers uniformes de 404 y errores.

Los casos de uso solo dependen de puertos. Ningún controller ni caso de uso importa el cliente de Supabase.

## Persistencia compartida

F2.1, F3 y F4 usan la misma instancia de `LeadRepository`:

- F2.1 llama `saveEnriched`.
- F3 llama `listViable`.
- F4 llama `findEnrichedById`.

Se implementará `SupabaseLeadRepository` para entornos con Supabase y se completará `InMemoryLeadRepository` para pruebas/demo. El adapter Supabase almacenará perfiles y leads enriquecidos en tablas versionadas mediante migración; los DTO se reconstruyen sin recalcular score, carril o matching.

La selección será:

- `PERSISTENCE_DRIVER=supabase` y credenciales válidas: Supabase para leads, swipes y telemetría.
- Driver de memoria: repositorios en memoria y seed demo fuera de producción.
- Configuración Supabase incompleta: error de arranque, no fallback silencioso.

## Contratos

`backend/src/shared/contracts.ts` sigue siendo la fuente de verdad y se sincroniza al frontend con `npm run contracts:sync`.

Antes de exponer F3/F4 se completarán los tipos F2.1 que el código ya usa: deck, tarjeta de match, acciones/eventos de swipe, resumen y telemetría. También se alinearán `ProjectMatch`, `Factor` y `EnrichedLead` con la adenda A8.

Las respuestas conservarán `ApiResponse<T>`.

## F3: autenticación y lista

El módulo `closer-dashboard` incluirá:

- Login, logout y consulta de sesión.
- Cookie opaca `httpOnly`, `SameSite=Strict`, `Secure` en producción y TTL configurable.
- Middleware `requireCloser`.
- Caso de uso para listar únicamente leads viables.
- Filtros, orden y paginación validados con Zod.
- Mapper `EnrichedLead → ViableLeadListItem`.

Rutas:

- `POST /api/closer/auth/login`
- `POST /api/closer/auth/logout`
- `GET /api/closer/auth/session`
- `GET /api/closer/leads`

La búsqueda por nombre seguirá en el cliente para no enviar PII en query strings.

## F4: briefing y contacto

El módulo `closer-briefing` incluirá:

- Caso de uso para construir `BriefingSheet` desde el lead enriquecido y journey disponible.
- Talking points, alertas, resumen de score y objeciones deterministas; el LLM podrá redactar, pero no decidir score ni carril.
- Revelado del teléfono mediante `ContactVaultPort`.
- Registro obligatorio mediante `AuditLogPort` antes de devolver contacto real.

Rutas:

- `GET /api/closer/leads/briefing/:leadId`
- `POST /api/closer/leads/reveal-contact`

`POST /api/closer/leads/call` queda fuera mientras el frontend no lo utilice.

## Flujo de datos

1. El usuario completa swipes en F2.1.
2. `POST /api/leads/enrichment/summary` construye y persiste `EnrichedLead`.
3. El closer inicia sesión y recibe una cookie opaca.
4. F3 solicita la lista; el backend filtra leads viables, ordena y pagina.
5. El closer abre un lead; F4 construye el briefing sin exponer el teléfono real.
6. Solo una acción explícita revela el contacto y genera auditoría.

El frontend ya prioriza estas APIs. Para validar integración real se deshabilitará `VITE_DEMO_MODE`; los seeds no deben ocultar errores del backend.

## Errores y seguridad

- Payload, query o parámetros inválidos: `VALIDATION_ERROR`.
- Credenciales inválidas o sesión ausente: 401 sin distinguir usuario inexistente.
- Lead inexistente: 404.
- Fallo de persistencia: error uniforme sin detalles internos.
- No se registran nombres, teléfonos, credenciales, cookies ni cuerpos con PII.
- Los endpoints closer siempre requieren sesión, salvo login.
- El teléfono permanece enmascarado hasta el reveal auditado.

## Pruebas

Se aplicará TDD en capas:

1. Contratos y mappers F2.1.
2. Comportamiento equivalente de `listViable` en memoria y Supabase.
3. Casos de uso F3: filtros, orden, paginación y exclusión de no viables.
4. Auth: login, cookie, expiración, logout y rechazo sin sesión.
5. F4: briefing, lead inexistente y reveal auditado.
6. Pruebas HTTP de rutas y formato `ApiResponse`.
7. Integración frontend con demo desactivado.

Gate final:

- Backend: `npm run verify` y `npm run build`.
- Frontend: `npm run verify`.
- Prueba manual: F2.1 summary → F3 list → F4 detail → reveal contact.

## Criterios de aceptación

- Un lead cerrado en F2.1 aparece en F3 sin seed del frontend.
- El detalle F4 muestra el mismo lead y sus matches.
- Los datos sobreviven al reinicio cuando se usa Supabase.
- Lista, detalle y reveal rechazan solicitudes sin sesión.
- Reveal deja registro de auditoría y no filtra el teléfono en logs.
- Ambos repositorios compilan, sus verificaciones pasan y los contratos están sincronizados.

## Fuera de alcance

- Implementar F1 o F2.2.
- Cambiar la UI de F3/F4.
- Búsqueda server-side con PII.
- Integración real de telefonía.
- Decisiones de score, carril o matching realizadas por LLM.
