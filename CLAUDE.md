# EQUIPO.md — Perfilador de Leads de Vivienda · Backend

> **Hackathon Colsubsidio × 30X · Reto Vivienda** · 22–26 jul 2026, Bogotá
> Documento vivo del equipo. Si algo aquí está desactualizado, **arréglalo en el mismo PR**.
> El repo del frontend tiene su propio `EQUIPO.md`; las secciones 1–4 y 7–9 son idénticas.

---

## 1. Qué estamos construyendo

**Un perfilador que hace que el lead se perfile solo antes de llegar al comercial.**

Hoy los leads de pauta pagada llegan crudos al asesor: sin perfilar, sin capacidad validada,
muchos no afiliados o sin poder de compra. El asesor pierde horas persiguiendo leads que no
cierran. Nosotros hacemos que al asesor **solo le lleguen leads viables y listos para cerrar**,
y que **los no viables no se descarten, sino que se nutran**.

**El objetivo es ganar.** Hay un solo podio para los 4 retos y las soluciones ganadoras por
reto pasan a evaluación de producto de Colsubsidio. O sea: **Colsubsidio es el usuario real
que va a aplicar e invertir en esto.** Todo lo que construyamos tiene que ser algo que una
caja de compensación pueda implementar de verdad (ver §8).

### Por qué elegimos Vivienda

Es el **único reto con datos de resultado real etiquetado**: 4.142 compradores de los últimos
3–4 años con **fecha de desistimiento** (quién se cayó). Eso nos permite **calibrar el scoring
contra conversiones reales** en vez de inventar heurísticas. Ningún otro reto puede decir eso.

### Rúbrica — optimizamos en este orden

| Peso | Criterio | Dónde se gana |
|---|---|---|
| **30%** | Perfilamiento (calidad de la clasificación) | F1 · scoring calibrado + glass-box |
| **20%** | Reducción de ruido al comercial | F3 · dashboard solo con viables, ordenado por cierre |
| **20%** | Innovación / escalabilidad | Arquitectura desacoplada + slide de integración |
| **15%** | Lead nutrible (no descartar al no viable) | F2.2 · nutrición gamificada con SFV |
| **15%** | UX (sin sentirse un interrogatorio; autogestionado) | F1 chat + F2.2 progreso |

### Principio glass-box — la regla dura del proyecto

> **La lógica decide; el LLM solo parsea y redacta.**

El scoring, la validación de capacidad y el enrutamiento son **funciones deterministas y
explicables**. El LLM se usa **exclusivamente** para (a) convertir texto libre del usuario en
datos estructurados y (b) redactar el "por qué" en lenguaje natural. **Nunca** para tomar la
decisión.

Prohibida cualquier caja negra: **cada clasificación debe poder explicarse con sus factores y
pesos** (`ScoreResult.factores`). Si no se puede explicar, no se muestra.

Esto no es purismo técnico: es lo que hace la solución **auditable** frente a una entidad
Vigilada Supersubsidio, y es nuestro argumento más fuerte frente al jurado.

### Restricciones del reto

- **Autogestionado:** un jurado desconocido debe recorrer el flujo **solo**, sin que lo guiemos.
  Un flujo que necesita explicación en vivo es un anti-patrón.
- **Regla 90/10:** por regulación, ~90% de las ventas de vivienda de la caja deben ir a
  **afiliados** → distinguimos afiliado/no afiliado desde el primer paso y ordenamos el embudo
  por eso.
- **Fuera de alcance (todo se mockea):** integración real con CRM, integración real con
  DataCrédito, aprobación de crédito, promesa de compraventa, documentos legales.
- **Canal:** WhatsApp es el canal nombrado, pero para la demo se **mockea con una UI estilo
  WhatsApp en web** con URL pública. **No integramos la WhatsApp Business API real** (trampa de
  tiempo). La lógica va desacoplada del canal.

---

## 2. El flujo

```
                 ┌──────────────── APP CLIENTE (usuario final, SIN login) ─────────────────┐
                 │                                                                          │
   Usuario ─────▶│  F1 · lead-intake                                                        │
                 │  chat WhatsApp → llena LeadProfile → consentimiento + gate afiliado       │
                 │  + capacidad + score + matching                                           │
                 │                                  │                                        │
                 │                      decide carril│                                       │
                 │                ┌─────────────────┴──────────────────┐                     │
                 │           viable│                                    │no viable            │
                 │                 ▼                                    ▼                     │
                 │     F2.1 · lead-enrichment              F2.2 · lead-education (gamificado) │
                 │     expande info + intereses            educa y convierte (SFV + reloj)    │
                 │                 │                                    │ (si progresa→viable)│
                 └─────────────────┼────────────────────────────────────┼────────────────────┘
                                   │ persiste lead viable                │
                                   ▼                                     │
                 ┌──────────────── APP CLOSER (rol closer, CON cuenta) ──┼────────────────────┐
                 │                                                       │                    │
                 │  F3 · closer-dashboard  ◀──── repositorio de leads viables ◀───────────────┘
                 │  lista todos los viables, filtra/prioriza, "llamar"                        │
                 │                 │ al dar "llamar"                                          │
                 │                 ▼                                                          │
                 │  F4 · closer-briefing                                                       │
                 │  ficha técnica del cliente para preparar/acompañar la llamada en vivo       │
                 └─────────────────────────────────────────────────────────────────────────────┘
```

### Ciclo de vida de un lead

1. **F1 – Intake.** El usuario entra al chat. Primero **acepta el tratamiento de datos**
   (requisito legal, no es un paso opcional). Se llena el `LeadProfile` y se decide
   `carril: 'viable' | 'no_viable'`.
2. **Si viable → F2.1 – Enrichment.** Se expande toda la info posible del cliente y sus
   intereses. Se persiste como **lead viable** → aparece en el dashboard del closer.
3. **Si no viable → F2.2 – Education.** Módulo gamificado de educación y conversión
   (plan SFV + reloj de meses + metas). Si progresa, **se reclasifica a viable**.
4. **F3 – Closer dashboard.** El closer (con cuenta) ve todos los leads viables y contacta
   uno a uno.
5. **F4 – Closer briefing.** Al dar "llamar", se abre la ficha técnica para preparar y
   acompañar la llamada en vivo.

### Roles y acceso

| Rol | Accede a | Auth |
|---|---|---|
| **Usuario final** | F1, F2.1, F2.2 | **Sin login** (autogestionado) |
| **Closer** | F3, F4 | **Con cuenta** (cookie de sesión `httpOnly`) |

La frontera de autorización del sistema está en **un solo lugar**: el middleware
`requireCloser` (`src/features/closer-dashboard/infrastructure/closer-session.middleware.ts`).
Todo lo que esté bajo `/api/closer/*` pasa por ahí.

---

## 3. Features y dueños

Cada feature es un **vertical slice** con sus propias capas. **Un dev = una feature.**

| # | Feature | Rol | Responsabilidad | Dueño |
|---|---|---|---|---|
| **F1** | `lead-intake` | usuario final | Conversación que llena el `LeadProfile` y decide viabilidad | _(asignar)_ |
| **F2.1** | `lead-enrichment` | usuario final (viable) | Expandir info e intereses del cliente viable | _(asignar)_ |
| **F2.2** | `lead-education` | usuario final (no viable) | Educar y convertir a viable mediante gamificación | _(asignar)_ |
| **F3** | `closer-dashboard` | closer | Dashboard de leads viables, filtrar/priorizar, "llamar" | _(asignar)_ |
| **F4** | `closer-briefing` | closer | Ficha técnica del cliente para la llamada en vivo | _(asignar)_ |
| — | `analysis/` + `data/` | — | Pipeline offline: calibrar `weights.json` y `project_profiles.json` | _(asignar)_ |
| — | `shared/` + bootstrap | — | Contrato, puertos, seguridad, wiring. **Cambios se anuncian.** | _(asignar)_ |

> **Llena la columna "Dueño" antes de empezar a codear.** Dos personas en la misma feature es
> la forma más rápida de perder una hora en conflictos de merge.

### Detalle de cada feature

**F1 · `lead-intake`** — Entrada: mensajes del usuario. Salida: `LeadProfile` con `carril` +
`score` + `proyectos`. Al terminar: `viable` → dispara F2.1; `no_viable` → dispara F2.2.
Sub-módulos: *conversation* (`getNextStep`, `parseAnswer` (LLM), `updateProfile`,
`isReadyToRoute`, `buildBotMessage`), *profiling* (`checkAffiliation`, `estimateCapacity`,
`scoreLead`, `getTopFactors`), *matching* (`matchProjects`, `filterByEligibility`,
`explainMatch`), *routing* (`decideViability`).
Depende de datos calibrados: `data/weights.json` y `data/project_profiles.json`.
**Regla UX:** inferir antes de preguntar; máx. ~5–6 preguntas; opciones tappables + texto libre.

**F2.1 · `lead-enrichment`** — Entrada: `LeadProfile` viable. Salida: `EnrichedLead` persistido.
`buildEnrichmentFlow`, `captureInterests`, `capturePreferences`, `captureContactability`,
`scoreIntent`, `persistViableLead`.
**Regla UX:** sigue conversacional; usa lo ya sabido para preguntar solo lo nuevo.

**F2.2 · `lead-education`** — Entrada: `LeadProfile` no viable + razón. Salida:
`EducationJourney` + posible reclasificación. `estimateSubsidy` (¿≤ 4 SMMLV?),
`computeNurturePlan`, `buildGamifiedJourney`, `trackProgress`, `buildEducationalContent`,
`checkReadmission`, `scheduleFollowUp` (mock).

```
gap                = precioObjetivo − ahorroDeclarado − subsidioEstimado
mesesParaCalificar = gap / capacidadAhorroMensual
```

**F3 · `closer-dashboard`** — `authenticateCloser`, `listViableLeads` (por score/recencia),
`getLeadCard`, `initiateCall` → F4. **Gated**, solo rol closer.

**F4 · `closer-briefing`** — `buildBriefingSheet`, `getTalkingPoints`, `getMatchRationale`.
Contenido: quién es, capacidad, afiliación, proyectos afines y su porqué, factores del score,
intereses/preferencias, mejor horario, puntos de conversación sugeridos, controles de llamada
(mock). **Denso pero escaneable** — se mira durante una llamada.

---

## 4. Cómo se comunican las features

**Solo por `src/shared/contracts.ts` y por los puertos de `src/shared/application/ports/`.
Nunca importando internals de otra feature.** Esto es lo que permite que 5 devs trabajen en
paralelo sin colisionar.

```
✅ import type { LeadProfile } from '@contracts';
✅ import type { LeadRepository } from '../../../shared/application/ports/index.js';
❌ import { scoreLead } from '../../lead-intake/domain/profiling.js';   // ESLint lo bloquea
```

**ESLint hace cumplir esto, no solo lo sugiere.** Si tu import falla el lint con un mensaje que
cita una regla de este documento, **el import está mal, no la regla**.

### `contracts.ts` es la fuente de verdad

Vive en **`perfilador-vivienda-backend/src/shared/contracts.ts`** y se copia al frontend:

```bash
npm run contracts:sync
```

- **Nunca edites la copia del frontend.** `npm run verify` corre `contracts:check` y **rompe el
  build** si las dos copias divergen.
- **Un cambio al contrato rompe a todo el equipo.** Anúncialo en el canal **antes** de mergear.
- **Si te falta un dato, propón el campo.** No lo agregues en silencio dentro de tu feature.

Las **adendas al contrato original del brief** (consentimiento, identidad de contacto
enmascarada, `Meta`, DTOs de F1/F3/F4) están documentadas con su justificación en la cabecera
de `contracts.ts` (A1–A8). Léela una vez antes de empezar.

> **Adenda A8 — la más reciente.** La añadió la implementación de F3/F4 en el frontend, que ya
> están construidas contra el diseño aprobado. Lo que te toca si implementas el motor:
> - `Factor.intensidad` (0-100) es **obligatorio**: es lo único que se puede dibujar como barra.
>   `contribucion` trae signo y `peso` describe al modelo, no al lead.
> - `ProjectMatch` ahora viaja con `nombre`, `etapa`, `precioDesde` y `tipologia` resueltos: el
>   closer los lee en voz alta y no puede esperar un segundo round-trip por `proyectoId`.
> - `ViableLeadListItem` cambió `proyectoTopId` por `proyectoTop`, y gana `edad`, `ocupacion`,
>   `capacidadEstimada` y `cuotaEstimada`.
> - `EnrichedLead` gana identidad y recorrido (`edad`, `ocupacion`, `hogar`, `ingresosSmmlv`,
>   `subsidioEstimado`, `citaTextual`, `contactabilidad`, `horarioRazon`, `timeline`).
> - `BriefingSheet` gana `resumenScore` (lo **redacta** el LLM sobre factores ya calculados,
>   no los calcula) y `objeciones`.
> - `LeadListFilters` gana `soloNutridos` y `busqueda`; `LeadListSort` gana `capacidad_desc`.
> - Nueva ruta `API_ROUTES.closer.revealContact` — acción auditada, ver §9 regla 17.
>
> **`filters.busqueda` no llega por query string:** el término puede ser el nombre de un lead y
> un nombre en la URL queda en logs de proxies y en el `Referer`. Hoy el frontend filtra el texto
> localmente; si se mueve a servidor, va en el body de un POST.

### Única excepción documentada al aislamiento

`requireCloser` se exporta desde `closer-dashboard.module.ts` y **F4 lo consume**. Es un puerto
de autorización compartido, y duplicarlo sería peor: dos implementaciones de la frontera de
seguridad es como se abren los huecos. Está anotado como excepción en el código.

---

## 5. Estructura del repo (backend)

```
src/
  features/
    lead-intake/
      domain/          # funciones puras: conversación, scoring, matching, routing
      application/     # casos de uso (una clase, un execute)
      infrastructure/  # adapters propios de la feature
      interface/        # controller de Express + DTOs zod
      lead-intake.module.ts   # composition root de la feature → { router }
    lead-enrichment/   # mismas capas
    lead-education/
    closer-dashboard/  # + closer-session.middleware.ts (la frontera de auth)
    closer-briefing/
  shared/
    contracts.ts       # ← FUENTE DE VERDAD del contrato
    kernel/            # Result/Either, errores base
    domain/            # Money, SalaryRange, helpers de LeadProfile
    application/ports/ # LeadRepository, LlmPort, ClockPort, ContactVaultPort, …
    infrastructure/    # adapters in-memory, config, logger, seguridad HTTP
  app.ts               # COMPOSITION ROOT: aquí y solo aquí se eligen implementaciones
  main.ts
analysis/              # pipeline offline en Python (stubs) + README del método
data/                  # weights.json, project_profiles.json (placeholders)
tests/
```

### La regla de dependencia, en una línea

```
interface ──▶ application ──▶ domain ◀── infrastructure
                                 ▲
                      domain no depende de NADA
```

`app.ts` es el **único** archivo del backend que sabe qué implementación concreta se usa.
Cambiar in-memory por PostgreSQL, o el stub de LLM por Anthropic, se hace **ahí y en ningún
otro lado**. Ese desacople es exactamente lo que le vamos a mostrar al jurado en el slide de
integración a producto: Colsubsidio puede adoptar esto sin reescribir el dominio.

---

## 6. Instalar, correr, desplegar

### Requisitos
Node **≥ 22**, npm ≥ 10. Python ≥ 3.11 solo si trabajas en `analysis/`.

### Arranque
```bash
npm install
cp .env.example .env
npm run dev
```
Levanta en `http://localhost:3000`. Health check: `GET /api/health`.

Puedes trabajar **sin API key de LLM**: `LLM_PROVIDER=stub` en `.env` usa un adapter
determinista sin red.

### Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente (tsx watch) |
| `npm run build` / `npm start` | Compila a `dist/` y corre |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint (hace cumplir las reglas de este documento) |
| `npm test` / `test:watch` | Vitest |
| `npm run contracts:sync` | Copia `contracts.ts` al repo del frontend |
| `npm run contracts:check` | Falla si las dos copias divergieron |
| **`npm run verify`** | **contracts:check + typecheck + lint + test. Corre esto antes de cada PR.** |

### Deploy
El backend es un Express estándar sin estado en disco (persistencia in-memory por ahora), así
que corre en cualquier PaaS con Node: Railway, Render, Fly.io.
1. Variables de entorno del panel = las de `.env.example`.
2. `CORS_ORIGINS` con el dominio real del frontend. **Nunca `*`** — `env.ts` lo rechaza en
   producción.
3. `NODE_ENV=production` activa `secure: true` en la cookie de sesión, así que **el deploy
   tiene que ir por HTTPS** o el login del closer no funcionará.

> **Ten la URL viva en la primera hora.** Un deploy roto a las 11 de la noche es la forma
> clásica de perder una hackathon con el producto ya terminado.

---

## 7. Trampas de datos y datos del reto

### Insumos
- **Base de compradores (Excel):** 4.142 compradores anonimizados, **sin cédulas**. Columnas:
  proyecto/etapa/código, fecha de opción, **fecha de desistimiento** (vacía = compra vigente),
  entidad financiera, medio por el que se enteró, valor de vivienda, afiliado sí/no, segmento,
  categoría, rango salarial, personas a cargo, empresa/pirámide/ranking, marca 'foco'.
- **Buyer personas por proyecto (PPT):** perfil del comprador de cada proyecto. Versiones
  agrupadas norte/sur.
- **Brochure:** proyectos disponibles con info y mapa 360.

### ⚠️ Trampa 1 — el valor de vivienda trae ceros de más
`523.620` significa **~523 millones**. **Se normaliza UNA sola vez, en el pipeline de
`analysis/`.** Todo lo que cruza `contracts.ts` ya viene en **pesos enteros** (`type COP`).

> **El frontend NUNCA multiplica ni divide por 1000.** Solo formatea. Si un monto se ve raro
> en pantalla, el bug está en el pipeline, no en el formatter.

### ⚠️ Trampa 2 — el estrato está incompleto
Los porcentajes de estrato **no suman 100%**. **No usar estrato como variable dura del score.**
`weights.json` no puede contener ninguna clave `estrato`, y el `README` de `analysis/` explica
por qué. Si un revisor pregunta "¿y el estrato?", esa es una respuesta que nos da puntos.

### Target del scoring
```
target = compró Y fecha_desistimiento vacía   (compra vigente)
```
Preferimos un **modelo lineal interpretable** (regresión logística → pesos legibles) sobre un
ensemble opaco. Con el principio glass-box, un modelo de caja negra nos descalifica solo.

---

## 8. Marco legal y qué puede (y no puede) hacer Colsubsidio

> **Esto no es letra chica: es el filtro de viabilidad de la solución.** Colsubsidio es una
> caja de compensación familiar **Vigilada Supersubsidio**. Si una funcionalidad no es
> implementable por una caja, no sirve que sea brillante.
>
> Nosotros diseñamos **dentro** de estos lineamientos; la validación jurídica final es de
> Colsubsidio, no nuestra. Cuando algo quede en zona gris, **anótalo y pregunta** en vez de
> asumir.

### Leyes que nos aplican

| Norma | Qué exige | Cómo lo cumplimos |
|---|---|---|
| **Ley 1581 de 2012** (habeas data) + **Decreto 1377 de 2013** | Todo tratamiento de datos personales exige **consentimiento previo, expreso e informado**. Finalidades explícitas y acotadas. Derechos del titular: conocer, actualizar, rectificar, suprimir y **revocar**. | `ConsentRecord` es el primer paso del flujo y un gate real: sin `otorgado === true` no se perfila ni se persiste. `versionPolitica` deja evidencia de **qué texto** aceptó el titular. Ruta `/politica-de-datos` en el front. |
| **Ley 1266 de 2008** (habeas data financiero) | Consultar centrales de riesgo (DataCrédito, etc.) exige autorización previa y expresa del titular. | **No consultamos ninguna central de riesgo.** `estimateCapacity` estima una **banda** con datos declarados por el usuario. Está fuera de alcance a propósito. |
| **Ley 21 de 1982** y **Ley 920 de 2004** | Las cajas sirven a **afiliados**; el crédito social y los planes de vivienda son para afiliados. | Fundamenta la **regla 90/10**: la afiliación es el primer discriminante del embudo y `filterByEligibility` la aplica. |
| **Subsidio Familiar de Vivienda (SFV)** | Aporte de la caja a hogares con ingresos **≤ 4 SMMLV**, como complemento al ahorro y al crédito. | Es la palanca de F2.2. `TOPE_SFV_SMMLV = 4` en `contracts.ts`. |
| **Vigilancia de la SIC** | Las bases de datos personales pueden requerir registro en el **RNBD**, y hay régimen sancionatorio. | Requisito de integración a producto: lo listamos en el slide, no lo simulamos. |

### 🚫 Prohibiciones duras — no negociables, en ningún PR

- **No usamos cédulas reales ni ninguna PII real.** Los datos del reto vienen anonimizados;
  se quedan así. Los fixtures usan nombres claramente ficticios.
- **Prohibido scrapear datos a partir de cédulas.** Es exactamente el escenario que la Ley 1581
  prohíbe. Si a alguien se le ocurre "enriquecer" un lead buscando su cédula: no.
- **Prohibido consultar DataCrédito** o cualquier central de riesgo. Se mockea.
- **No aprobamos crédito.** La aprobación es del banco. Nosotros estimamos una **banda de
  capacidad** con datos declarados, y lo decimos así en la UI.
- **No prometemos subsidio.** `estimateSubsidy` produce un **estimado** y la UI tiene que
  decir "estimado", nunca "aprobado". Prometer un subsidio que no se otorga es un riesgo
  reputacional y legal para la caja.
- **No PII en logs.** El logger de pino tiene `redact` configurado. No lo desactives, y no
  loguees el objeto de request completo.
- **Nada de mensajería real** (WhatsApp/SMS/email) sin consentimiento para esa finalidad
  específica. `scheduleFollowUp` es mock a propósito.
- **El aviso de privacidad de la demo dice que es una demo.** No publicamos un documento que
  se lea como un aviso legal vigente de Colsubsidio: no somos Colsubsidio.

### Qué SÍ puede hacer Colsubsidio (y por eso lo construimos)

Otorgar el SFV a afiliados que califiquen · ofrecer crédito social y ahorro programado a
afiliados · comercializar sus propios proyectos de vivienda · hacer educación financiera y
acompañamiento · perfilar y contactar leads **con consentimiento** · vender a no afiliados
**dentro del margen de la regla 90/10**.

### Qué NO puede hacer (y por eso lo dejamos fuera)

Operar como banco pleno ni sustituir el análisis de riesgo de la entidad financiera · consultar
centrales de riesgo sin autorización expresa del titular · tratar datos sin consentimiento ·
ignorar el margen 90/10 · discriminar en el acceso a sus servicios.

> **Regla práctica:** antes de agregar una funcionalidad, pregúntate *"¿podría Colsubsidio
> encender esto el lunes sin llamar a un abogado?"* Si la respuesta es no, va al slide de
> "qué necesitamos de Colsubsidio", no al código.

---

## 9. Reglas de iteración y construcción con IA

**Obligatorias para cualquier código, humano o generado por IA.** ESLint hace cumplir varias
automáticamente.

### Clean Architecture (reglas duras)

1. **Regla de dependencia:** las dependencias apuntan **hacia adentro**. `domain` no depende de
   nada; `application` depende solo de `domain`; `infrastructure` e `interface` dependen de
   `application`/`domain`, **nunca al revés**.
2. **Dominio puro:** sin tipos de framework (nada de Express, React, Prisma, zod) en `domain`
   ni `application`. El dominio no sabe que existe una base de datos ni una API.
3. **Puertos y adaptadores:** persistencia, LLM, reloj, vault y auditoría se acceden por
   **interfaces (puertos)** definidas en `application`; las implementaciones viven en
   `infrastructure`. Empezamos con adapters in-memory.
4. **Aislamiento de features:** una feature **no importa internals de otra**. Se comunican por
   `contracts.ts` o por puertos compartidos.
5. **Casos de uso explícitos:** cada acción de negocio es un caso de uso con entrada y salida
   claras. **Nada de lógica de negocio en controllers ni en componentes.**

### Clean Code

6. **Funciones pequeñas y puras** siempre que se pueda; una función, una responsabilidad.
7. **Nombres con intención:** identificadores en inglés; términos del dominio en español cuando
   son el lenguaje ubicuo (`afiliado`, `subsidio`, `segmento`, `carril`). Consistencia sobre
   preferencia personal.
8. **Tipado estricto:** `strict: true`, **prohibido `any`**, prohibido `@ts-ignore`. Modela los
   estados imposibles como imposibles.
9. **Sin código muerto**, sin comentarios que narran lo obvio. **Comenta el *porqué*, no el
   *qué*.**
10. **Tests del núcleo:** la lógica de dominio (scoring, capacidad, plan de nutrición,
    enrutamiento) va cubierta con tests. Es determinista, así que es fácil de testear.
11. **Manejo de errores explícito:** `Result`/`Either` en el dominio para flujos esperados, no
    excepciones.

### Seguridad — OWASP, siempre

12. **Valida en el borde, confía en nada.** Todo body/query/param entra por un esquema **zod**
    en el controller antes de tocar un caso de uso (**A03 Inyección**). Los strings llevan
    largo máximo: además de higiene, acota la superficie de **prompt injection** hacia el LLM.
13. **La autorización se impone en el servidor, en cada request** (**A01 Control de acceso
    roto**). El guard del frontend es **UX, no seguridad**. Nunca decidas permisos con un dato
    que vino del cliente, y verifica que el recurso pedido le pertenece a quien lo pide.
14. **Sesiones:** el token del closer va en cookie **`httpOnly` + `SameSite=Strict` + `Secure`
    en producción**, con TTL. **Nunca en `localStorage`** (un XSS se lleva la sesión — **A07**).
    Login detrás de rate limit y con mensaje de error **genérico**: no damos oráculo de
    enumeración de usuarios.
15. **No filtres información en los errores** (**A09**). El error completo va al log del
    servidor; al cliente va `{ code, message, fields }` sin stack traces ni detalles internos.
    El `errorHandler` ya lo hace: no lo bypasees.
16. **Secretos solo en `.env`** con su entrada en `.env.example`, nunca hardcodeados, nunca en
    el repo (**A05**). En el frontend, recuerda que **todo `VITE_*` es público**: una API key
    ahí es una API key filtrada. Si filtras una llave, **rótala** antes de seguir.
17. **Auditoría de accesos sensibles:** revelar el contacto de un lead se registra en
    `AuditLogPort` (quién, a quién, cuándo, resultado). **Nunca loguees PII**: el logger tiene
    `redact` configurado.
18. **Minimización de datos:** pedimos lo mínimo para decidir, y el dato de contacto real vive
    detrás de `ContactVaultPort`. Los DTOs solo llevan el teléfono **enmascarado** + un token
    opaco. Antes de agregar un campo, pregúntate si de verdad lo necesitas.
19. **Dependencias:** no metas una librería por una función de 10 líneas (**A06**). Si agregas
    una dependencia, dilo en el PR.

### Reglas específicas del proyecto

20. **Glass-box, no caja negra:** scoring, capacidad y enrutamiento son **deterministas y
    explicables**. El LLM **solo** parsea texto libre y redacta el "por qué". **Prohibido que un
    modelo tome la decisión.** Un `LlmPort` con un método que puntúe o clasifique es un bug de
    arquitectura, no una optimización.
21. **Explicabilidad obligatoria:** toda clasificación expone sus factores y pesos
    (`ScoreResult.factores`). Si no se puede explicar, no se muestra.
22. **Valida la salida del LLM antes de que entre al dominio.** El texto del modelo es entrada
    no confiable, igual que el input de un usuario: pásalo por zod.
23. **Cada cambio de scoring documenta su porqué** (qué señal, qué peso, por qué). El scoring
    es auditable.
24. **Desacople del canal:** la lógica **no conoce WhatsApp**. El canal es una capa de
    presentación intercambiable.
25. **Datos:** normaliza el valor de vivienda en `analysis/`; **no uses estrato** como variable
    dura; **nunca** cédulas ni PII; **nunca** DataCrédito ni scraping.

### Trabajando con IA (Claude Code y asistentes)

26. **Respeta el límite de tu feature.** La IA solo modifica la carpeta de la feature en la que
    estás trabajando. Cambios a `contracts.ts` o a puertos compartidos se **marcan y anuncian**
    al equipo: rompen a todos.
27. **No inventar el contrato.** Si falta un dato en `LeadProfile`/`EnrichedLead`, propón el
    cambio explícitamente. Nada de campos silenciosos dentro de tu feature.
28. **Stubs primero, lógica después.** Al hacer scaffolding: firmas tipadas con
    `throw new Error('TODO: not implemented')`, no implementaciones a medias que parecen listas.
29. **Revisa lo que genera la IA con los ojos de esta lista.** Los modelos son buenos generando
    código que compila y malos recordando que el estrato no se usa, que no se consulta
    DataCrédito y que el LLM no decide. **El código generado que viole §8 o §9 no entra**, por
    bonito que se vea.
30. **Pídele el *porqué*, no solo el código.** Si no puedes explicar en una frase por qué un
    bloque generado hace lo que hace, todavía no está listo para mergear.

### Git

31. Ramas por feature: `feat/lead-intake`, `feat/closer-dashboard`, …
32. Commits convencionales: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
33. **`main` siempre desplegable.** Corre `npm run verify` antes de abrir el PR.
34. No comitees `.env`, datos crudos del reto, `node_modules/` ni `dist/`. El `.gitignore` ya
    los cubre — no lo relajes.

---

## 10. Roadmap del día (referencia)

| Hora | Qué |
|---|---|
| 0–1h | Análisis offline → `weights.json` + `project_profiles.json` · scaffolding · **deploy con URL viva ya** |
| 1–4h | F1 intake (conversación + scoring conectado) |
| 3–6h | F2.1 enrichment + F2.2 education + persistencia de viables |
| 4–7h | F3 dashboard + F4 ficha técnica |
| 6–8h | Pulir UI WhatsApp, señales de confianza, 3 personas semilla |
| 8–9h | **Test autogestionado: que lo maneje alguien que no lo construyó** |
| 9–10h | 5 slides (Problema → Solución → Demo → Impacto → **Integración a producto**) + ensayo |

**Roles sugeridos:** 1 data/análisis · 2 front/UX · 1 backend/motor · 1 pitch + QA.

### Los 5 diferenciadores que nos hacen ganar

1. **Scoring calibrado sobre los 4.142 reales**, no heurísticas inventadas.
2. **Módulo de nutrición gamificado** — el 15% que casi nadie trabaja, y lo más "Colsubsidio"
   del reto.
3. **Experiencia del closer** (dashboard + ficha técnica): cierra el ciclo y hace tangible la
   reducción de ruido.
4. **Matching lead ↔ proyecto por buyer persona real**, con razón basada en datos.
5. **Slide de integración a producto:** arquitectura desacoplada + qué necesitamos de
   Colsubsidio. Los ganadores pasan a producto: mostremos que ya pensamos en eso.
