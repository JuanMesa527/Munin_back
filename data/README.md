# `data/` — artefactos calibrados que consume el backend

Dos archivos, generados por el pipeline offline de [`analysis/`](../analysis/README.md).
Nadie los edita a mano.

| Archivo                 | Tipo del contrato             | Lo regenera                                                                |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `weights.json`          | `ScoringWeights`              | `analysis/scripts/03_calibrate_weights.py` → `05_export_artifacts.py`      |
| `project_profiles.json` | `ProjectProfile[]` (envuelto) | `analysis/scripts/04_build_project_profiles.py` → `05_export_artifacts.py` |

Los tipos viven en `src/shared/contracts.ts`. Quien lee estos archivos es
`src/shared/infrastructure/catalog/file-data-catalog.adapter.ts`, que los valida
con zod y los cachea.

## Estado actual: PLACEHOLDER

Los dos archivos traen `"placeholder": true` y un `"_aviso"`. **Mientras ese flag
esté presente, el adapter responde `DATA_UNAVAILABLE`** en vez de servir los
números. Es intencional: un score sin calibrar que se muestra como calibrado es
peor que no tener score. `05_export_artifacts.py` quita el flag al publicar los
artefactos reales.

Los 3 proyectos del placeholder son ficticios a propósito (`Ejemplo`, `Ficticias`,
`Muestra` en el nombre) para que nadie los confunda con oferta real.

## Reglas de forma

1. **Pesos en COP siempre en pesos enteros.** El valor de vivienda ya viene
   normalizado desde `analysis/` (trampa de datos #1: en el Excel `523.620`
   significa ~523.620.000). Ni el backend ni el frontend reescalan.
2. **`weights.json` no puede tener ninguna clave `estrato`.** Los porcentajes de
   estrato del dataset no suman 100%, así que no es una variable dura del score
   (trampa de datos #2). `assert_sin_estrato` corta la exportación si aparece.
3. **`project_profiles.json` va envuelto** en
   `{ "placeholder", "_aviso", "version", "generadoEn", "proyectos": [...] }`.
   El envoltorio existe solo porque un array JSON no admite el flag de
   placeholder a nivel de archivo; `proyectos` es exactamente `ProjectProfile[]`
   y es lo que devuelve `DataCatalogPort.getProjectProfiles()`.
4. **Cada distribución de `perfilComprador` suma 1.0** y describe compradores
   con compra vigente, no todos los compradores.
5. **Cero PII.** Solo agregados: proporciones por atributo, nunca filas. Un
   proyecto con menos de 20 compradores no publica distribución (ver
   `MIN_COMPRADORES_POR_PROYECTO`).

## Si el backend responde `DATA_UNAVAILABLE`

Es el comportamiento esperado con los placeholders puestos. Para trabajar sin el
pipeline, usa las fixtures del frontend (`model/<feature>.fixtures.ts`); para
levantar los artefactos de verdad, corre el pipeline de `analysis/`.
