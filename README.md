# perfilador-vivienda-backend

Motor de perfilamiento de leads de vivienda — **Hackathon Colsubsidio × 30X, Reto Vivienda**.

Express 5 + TypeScript, **feature-based + Clean Architecture**. Cinco features aisladas, un
contrato compartido, y todo el I/O detrás de puertos.

> 📖 **Antes de escribir código, lee [`CLAUDE.md`](./CLAUDE.md).** Tiene el flujo completo, las
> reglas de arquitectura y seguridad, los límites legales y qué puede/no puede hacer Colsubsidio.
> No es documentación decorativa: ESLint hace cumplir buena parte de ella.

---

## Arranque en 3 comandos

```bash
npm install
cp .env.example .env
npm run dev
```

Levanta en **http://localhost:3000** · health check: `GET /api/health`

Funciona **sin API key de LLM**: `LLM_PROVIDER=stub` (el default) usa un adapter determinista
sin red.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente |
| `npm run build` / `npm start` | Compila a `dist/` y corre |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm test` / `test:watch` | Vitest |
| `npm run contracts:sync` | Copia `contracts.ts` al repo del frontend |
| **`npm run verify`** | **contracts:check + typecheck + lint + test — corre esto antes de cada PR** |

## Estructura

```
src/
  features/            # 5 vertical slices, una por dev
    lead-intake/           F1 · conversación → LeadProfile → carril
    lead-enrichment/       F2.1 · expande el lead viable
    lead-education/        F2.2 · nutrición gamificada (SFV)
    closer-dashboard/      F3 · dashboard de viables + frontera de auth
    closer-briefing/       F4 · ficha técnica de la llamada
  shared/
    contracts.ts       # ← FUENTE DE VERDAD del contrato compartido
    kernel/            # Result/Either, errores
    domain/            # Money, SalaryRange, helpers de LeadProfile
    application/ports/ # LeadRepository, LlmPort, ClockPort, ContactVaultPort, …
    infrastructure/    # adapters in-memory, config, logger, seguridad HTTP
  app.ts               # COMPOSITION ROOT — el único lugar que elige implementaciones
  main.ts
analysis/              # pipeline offline en Python + README del método
data/                  # weights.json, project_profiles.json
```

Cada feature tiene sus capas `domain/` → `application/` → `infrastructure/` + `interface/`, y un
`<feature>.module.ts` que recibe puertos y devuelve un `Router` de Express.

## Estado actual: scaffolding

Los casos de uso y las funciones de dominio son **stubs tipados**
(`throw new Error('TODO: not implemented')`). La plomería **sí** está implementada: `Result`,
adapters in-memory, config validada, logger con redacción de PII, middleware de seguridad,
manejo de errores y el composition root.

**Cada dev implementa su feature.** Empieza por el `<feature>.module.ts` para ver cómo se
conecta, y de ahí hacia el dominio.

## Las cuatro cosas que se olvidan

1. **Glass-box.** El scoring, la capacidad y el enrutamiento son deterministas y explicables.
   El LLM **solo** parsea texto libre y redacta el "por qué" — **nunca decide**.
2. **`contracts.ts` es la fuente de verdad y vive aquí.** Cambiarlo rompe a todo el equipo:
   anúncialo antes de mergear y corre `npm run contracts:sync`.
3. **Legal no es opcional.** Sin cédulas, sin PII, sin DataCrédito, sin scraping. El
   consentimiento (Ley 1581 de 2012) es un gate real del pipeline, no un checkbox decorativo.
4. **Dos trampas de datos.** El valor de vivienda trae ceros de más (`523.620` ≈ 523 M) y se
   normaliza **solo** en `analysis/`. El estrato está incompleto y **no se usa** como variable
   dura del score.

## Deploy

Express sin estado en disco → cualquier PaaS con Node (Railway, Render, Fly.io).

- Variables de entorno = las de `.env.example`.
- `CORS_ORIGINS` con el dominio real del frontend. **Nunca `*`** — `env.ts` lo rechaza en
  producción.
- `NODE_ENV=production` activa `Secure` en la cookie de sesión ⇒ **el deploy debe ir por HTTPS**
  o el login del closer no funciona.
