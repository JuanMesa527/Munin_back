# Munin · Backend

Motor de perfilamiento de leads de vivienda — **Hackathon Colsubsidio × 30X, Reto Vivienda**.

Express 5 + TypeScript sobre **arquitectura hexagonal**: seis features aisladas, un contrato compartido, y **todo** el I/O detrás de puertos. La decisión de negocio vive en funciones puras que se testean sin levantar nada.

> Contexto del producto y tesis glass-box: [`../README.md`](../README.md) · Pesos y fórmulas: [`../Docs/glass-box-scoring.md`](../Docs/glass-box-scoring.md)

---

## Arranque

```bash
npm install
cp .env.example .env
npm run dev
```

**http://localhost:3000** · health check: `GET /api/health`

Corre **sin base de datos y sin llaves de LLM**: los defaults son `PERSISTENCE_DRIVER=memory` y `LLM_PROVIDER=stub` (adapter determinista, sin red). No necesitás credenciales para ver el flujo completo.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor con recarga en caliente (`tsx watch`) |
| `npm run build` · `npm start` | Compila a `dist/` y arranca |
| `npm test` · `test:watch` | Vitest — **430 tests en 55 archivos** |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` · `lint:fix` | ESLint |
| `npm run contracts:sync` | Copia `contracts.ts` al repo del frontend |
| `npm run seed:supabase` | Siembra datos de demo en Supabase |
| **`npm run verify`** | **contracts:check + typecheck + lint + test — corré esto antes de cada PR** |

---

## Arquitectura

Cuatro capas por feature, con una regla de dependencia que apunta siempre hacia adentro:

```
interface/        Borde HTTP. Valida con zod, llama al caso de uso, mapea Result → status.
   ↓              Cero lógica de negocio: si aparece un `if` que decide algo del dominio, va abajo.
application/      Casos de uso. Orquestan. Reciben PUERTOS, nunca implementaciones.
   ↓
domain/           Funciones puras. Sin I/O, sin `env`, sin Express, sin `LlmPort`.
                  Es lo que se puede testear en microsegundos y defender ante un jurado.
```

```
src/
  features/
    lead-intake/        F1 · conversación → LeadProfile → capacidad → score → carril
    lead-enrichment/    F2.1 · baraja de proyectos, swipes, intentScore
    lead-education/     F2.2 · nutrición gamificada + login por OTP del lead
    closer-dashboard/   F3 · cola de viables + frontera de autenticación
    closer-briefing/    F4 · ficha de llamada + revelado auditado de contacto
    call-simulation/    F5 · roleplay de cierre por voz + veredicto
  shared/
    contracts.ts        ← FUENTE DE VERDAD del contrato compartido con el front
    kernel/             Result/Either y jerarquía de errores
    domain/             Money, SalaryRange, City, subsidio SFV, helpers de LeadProfile
    application/ports/  20 puertos: LlmPort, LeadRepository, ContactVaultPort, ClockPort…
    infrastructure/     adapters, config, logger, seguridad HTTP, persistencia
  composition-root.ts   ← el ÚNICO lugar que elige implementaciones concretas
  main.ts               carga config, levanta, apaga ordenado
analysis/               pipeline offline en Python + README del método
data/                   weights.json · project_profiles.json · projects_catalog.json
```

**Dos reglas que ESLint hace cumplir:**

1. Una feature **nunca** importa internals de otra. Lo compartido sube a `shared/`.
2. Cada feature expone un `<feature>.module.ts` que recibe puertos y devuelve un `Router`.

---

## API

Todas las respuestas usan la misma envoltura `ApiResponse` (`{ ok, data }` o `{ ok, error }`), así que el frontend nunca tiene que tratar un error como caso raro.

| Método | Ruta | Auth |
| --- | --- | --- |
| `GET` | `/api/health` | — |
| **F1 · intake** | | |
| `POST` | `/api/leads/intake/start` · `/turn` · `/consent` | Flujo de cliente |
| **F2.1 · enrichment** | | |
| `GET` | `/api/leads/enrichment/deck` | Flujo de cliente |
| `POST` | `/api/leads/enrichment/swipe` · `/summary` · `/telemetry` | Flujo de cliente |
| **F2.2 · education** | | |
| `POST` | `/api/leads/education/auth/otp/request` · `/otp/verify` | Pública (rate limit estricto) |
| `GET` | `/api/leads/education/auth/session` · `POST /logout` | Cookie de lead |
| `GET` | `/api/leads/education/journey` | Cookie de lead + dueño |
| `POST` | `/api/leads/education/progress` | Cookie de lead + dueño |
| **F3/F4/F5 · closer** | | |
| `POST` | `/api/closer/auth/login` | Pública (10 intentos / 15 min) |
| `GET` | `/api/closer/auth/session` · `POST /logout` | Cookie de closer |
| `GET` | `/api/closer/leads` · `/leads/briefing` | Cookie de closer |
| `POST` | `/api/closer/leads/reveal-contact` · `/gestion` | Cookie de closer + auditoría |
| `POST` | `/api/closer/leads/call/start` · `/turn` · `/end` · `/transcribe` | Cookie de closer |

---

## Puertos y adapters

El corazón del diseño: cambiar de infraestructura es cambiar una variable de entorno, no tocar código.

| Puerto | Adapters disponibles | Se elige con |
| --- | --- | --- |
| `LlmPort` | `stub` · `deepseek` · `anthropic` | `LLM_PROVIDER` |
| `LeadRepository` · `EducationRepository` | in-memory · Supabase | `PERSISTENCE_DRIVER` |
| `ContactVaultPort` | in-memory · Supabase | `PERSISTENCE_DRIVER` |
| `CallSimulatorPort` | `stub` · DeepSeek | `CALL_SIM_PROVIDER` |
| `SpeechSynthesisPort` | noop · Amazon Polly | `SPEECH_PROVIDER` |
| `SpeechTranscriptionPort` | noop · Amazon Transcribe | `TRANSCRIPTION_PROVIDER` |
| `LeadOtpDeliveryPort` | mock (loguea) · SMTP | `EMAIL_PROVIDER` |
| `CallRecordingStore` | noop · Supabase | `PERSISTENCE_DRIVER` |
| `ClockPort` · `IdGeneratorPort` | sistema · `randomUUID` | — (inyectados para testear) |

`ClockPort` e `IdGeneratorPort` existen para que el dominio sea determinista en tests: sin ellos no se puede afirmar sobre un TTL o un id sin volver el test frágil.

**`CallSimulatorPort` es un puerto aparte de `LlmPort` a propósito.** El roleplay de F5 conversa; el LLM de F1 extrae datos. Mezclarlos abriría la puerta a que alguien enchufe un modelo donde se decide.

---

## Configuración

`env.ts` es el **único** archivo que lee `process.env`. El resto recibe un `AppEnv` inmutable, así que ningún módulo puede inventarse una variable.

**En producción la app no arranca si** queda el secreto de ejemplo, si el secreto mide menos de 32 caracteres, si `CLOSER_PASSWORD` mide menos de 12, si `CORS_ORIGINS` trae `*` o queda vacío, o si falta `PRIVACY_POLICY_VERSION`. Preferimos no arrancar antes que arrancar inseguros.

| Grupo | Variables |
| --- | --- |
| Servidor | `NODE_ENV` `PORT` `LOG_LEVEL` `CORS_ORIGINS` `TRUST_PROXY` |
| Seguridad | `RATE_LIMIT_ENABLED` `OTP_REVEAL_CAUSE` |
| Sesiones | `CLOSER_SESSION_SECRET` `CLOSER_USERNAME` `CLOSER_PASSWORD` `CLOSER_SESSION_TTL_MINUTES` `LEAD_SESSION_TTL_MINUTES` |
| LLM | `LLM_PROVIDER` `DEEPSEEK_API_KEY` `DEEPSEEK_MODEL` `ANTHROPIC_API_KEY` `LLM_MODEL` |
| Persistencia | `PERSISTENCE_DRIVER` `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` |
| Voz (F5) | `CALL_SIM_PROVIDER` `SPEECH_PROVIDER` `TRANSCRIPTION_PROVIDER` `AWS_REGION` `POLLY_*` |
| Correo | `EMAIL_PROVIDER` `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` |
| Datos | `WEIGHTS_PATH` `PROJECT_PROFILES_PATH` `PROJECTS_CATALOG_PATH` `PRIVACY_POLICY_VERSION` |

`TRUST_PROXY` importa más de lo que parece: en `0` detrás de un proxy, `req.ip` es la del proxy y **todos los usuarios caen en el mismo balde del rate limiter**. Detrás de Vercel va `1`.

`SUPABASE_SERVICE_ROLE_KEY` **ignora RLS**: vive solo acá, jamás en el frontend.

---

## Seguridad

Cada bloque de `infrastructure/http/security.ts` cita el ítem de OWASP que mitiga, para poder señalar la línea.

- **Rate limiting por costo real**, no uniforme: público 60/5 min · login closer 10/15 min · pedir OTP 5/15 min · verificar OTP 10/15 min · simulación de llamada 40/5 min (cada turno quema tokens de DeepSeek **y** caracteres de Polly).
- **Sesiones y OTP hasheados.** El token sale de `randomBytes(32)` y se guarda en SHA-256; el OTP usa `randomInt` del CSPRNG (nunca `Math.random`, nunca `randomBytes % N` que sesga), se compara con `timingSafeEqual` y muere a los 5 intentos o a los 5 minutos.
- **zod en todo borde**, y además descarta claves desconocidas. Body limitado a 32 kb, con 2 mb solo para el dictado y en su propio parser.
- **Logs sin PII.** pino redacta `cookie`, `authorization`, `*.token`, `*.telefono`, `*.cedula`, `*.password` y **no serializa la IP**. `console.*` está prohibido: hay cero ocurrencias.
- **Dependencias limpias.** `npm audit --omit=dev`: 0 vulnerabilidades.

---

## Datos

`data/` guarda tres artefactos agregados, sin PII, que el backend solo **lee**:

| Archivo | Contenido | Estado |
| --- | --- | --- |
| `projects_catalog.json` | 16 proyectos en 7 municipios | ✅ Real (brochures públicos, sin scraping) |
| `weights.json` | Pesos del score + umbral | ⚠️ `0.1.0-demo-manual`, `calibracion.n = 0` |
| `project_profiles.json` | Buyer persona por proyecto | ⚠️ `calibrado: false` |

`file-data-catalog.adapter.ts` los valida con zod al cargarlos y los cachea. El backend **nunca entrena nada**: el pipeline de calibración corre offline y a mano — método y trampas del dataset en [`analysis/README.md`](analysis/README.md).

---

## Glass-box: dónde está la frontera

El LLM **solo** parsea texto libre y redacta prosa. No puntúa, no clasifica, no ordena y no decide.

Es verificable leyendo firmas: `scoreLead`, `estimateCapacity`, `decideViability`, `matchProjects`, `calcularIntentScore` y `estimateSubsidy` **no reciben `LlmPort`**. Y la respuesta del modelo se trata como entrada no confiable: pasa por zod antes de tocar el dominio.

---

## Deploy

Express sin estado en disco → cualquier PaaS con Node ≥ 22 (Railway, Render, Fly.io).

- `CORS_ORIGINS` con el dominio real del frontend. **Nunca `*`** — `env.ts` lo rechaza en producción.
- `NODE_ENV=production` activa `Secure` en las cookies ⇒ **el deploy debe ir por HTTPS** o el login no funciona.
- `TRUST_PROXY=1` detrás de un PaaS con un proxy delante.
- `InMemorySessionStore` **no sobrevive un reinicio ni escala a más de una instancia**. Para producción real: Redis con TTL nativo, o la SSO corporativa (que sería lo correcto — no queremos ser dueños de las credenciales).

## Las cuatro cosas que se olvidan

1. **`contracts.ts` es la fuente de verdad y vive acá.** Cambiarlo rompe al frontend: anuncialo antes de mergear y corré `npm run contracts:sync`.
2. **Glass-box no es un eslogan.** Si una función de decisión termina recibiendo un puerto de LLM, el producto pierde su argumento central.
3. **Legal no es opcional.** Sin cédulas, sin PII en logs, sin DataCrédito, sin scraping. El consentimiento (Ley 1581 de 2012) es un gate real del pipeline.
4. **Dos trampas de datos.** El valor de vivienda trae ceros de menos (`523.620` ≈ 523 M) y se normaliza **una sola vez**, en `analysis/`. El estrato está incompleto y **no se usa** como variable del score — hay tres barreras independientes que lo impiden.
