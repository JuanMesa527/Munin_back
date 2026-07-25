# `analysis/` — pipeline offline de calibración

Este directorio es el **diferenciador de credibilidad** del proyecto: el score de
un lead no lo inventamos en una reunión, se **calibra contra 4.142 compradores
reales** de los últimos 3-4 años, cada uno con su fecha de opción y su fecha de
desistimiento.

El pipeline corre **offline, a mano y fuera del request**. El backend nunca
entrena nada: solo lee dos artefactos agregados de `data/`. Eso mantiene el
sistema rápido, auditable y reproducible.

> **Glass-box.** Todo lo que sale de aquí es un número explicable: un peso por
> factor y un umbral. El scoring, la capacidad y el enrutamiento en el backend son
> funciones puras y deterministas que consumen estos pesos. El LLM solo parsea
> texto libre del chat y redacta el "por qué" en lenguaje natural. **El LLM nunca
> decide, nunca puntúa y nunca clasifica.**

---

## 1. Mapa del pipeline

```
analysis/raw/compradores.xlsx                (crudo, NO se comitea)
        │
        ▼  01_load_and_clean.py     limpia, normaliza escalas, valida PII
raw/_interim/compradores_limpios.parquet
        │
        ▼  02_label_target.py       etiqueta compra_vigente (0/1)
raw/_interim/compradores_etiquetados.parquet
        │
        ├──▼  03_calibrate_weights.py       regresión logística → pesos + AUC
        │   raw/_interim/weights_calibrados.json
        │
        └──▼  04_build_project_profiles.py  buyer persona real por proyecto
            raw/_interim/project_profiles_calculados.json
                    │
                    ▼  05_export_artifacts.py   valida contra el contrato y publica
            data/weights.json   +   data/project_profiles.json
                    │
                    ▼
            file-data-catalog.adapter.ts  (zod + caché)  →  F1 scoring / matching / routing
```

| Etapa | Script                         | Produce                                                                                                                 |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1     | `01_load_and_clean.py`         | Parquet limpio + reporte de calidad (filas perdidas, nulos por columna, valores sospechosos). Corrige la **trampa #1**. |
| 2     | `02_label_target.py`           | Parquet con la columna `compra_vigente` + resumen de balance de clases.                                                 |
| 3     | `03_calibrate_weights.py`      | Payload `ScoringWeights`: `pesos`, `umbralViable`, `calibracion` (AUC y n).                                             |
| 4     | `04_build_project_profiles.py` | Payload `ProjectProfile[]`: rango de precios, `esVIS`, `proporcionAfiliados` y `perfilComprador`.                       |
| 5     | `05_export_artifacts.py`       | Los dos JSON de `data/`, ya validados y sin el flag de placeholder.                                                     |

Los intermedios viven en `analysis/raw/_interim/` **a propósito**: `.gitignore` ya
excluye todo `analysis/raw/`, así que es imposible comitear por accidente un
derivado fila-a-fila de los compradores.

---

## 2. Cómo correrlo

Requiere Python ≥ 3.11. Las fuentes crudas se piden por el canal del equipo y se
copian a `analysis/raw/` (ver `analysis/raw/.gitkeep` para los nombres exactos).

```bash
python -m venv .venv
.venv\Scripts\activate                 # Windows   |   source .venv/bin/activate
pip install -r analysis/requirements.txt

python analysis/scripts/01_load_and_clean.py --input analysis/raw/compradores.xlsx
python analysis/scripts/02_label_target.py --ventana-anios 4
python analysis/scripts/03_calibrate_weights.py --folds 5 --semilla 42
python analysis/scripts/04_build_project_profiles.py
python analysis/scripts/05_export_artifacts.py --dry-run    # valida sin escribir
python analysis/scripts/05_export_artifacts.py              # publica en data/
```

Se invocan por ruta (no con `python -m`) porque los nombres empiezan por dígito;
al ejecutarlos así, Python pone `analysis/scripts/` en el path y el `from common
import ...` resuelve.

Todos aceptan `--help`. La semilla está fija (42) para que dos corridas den los
mismos pesos: si el jurado pide la tabla otra vez, tiene que salir idéntica.

**Estado del scaffolding:** las firmas están completas y los cuerpos son
`raise NotImplementedError`. El orden de implementación es el orden de las etapas.

---

## 3. Las dos trampas de datos

### Trampa #1 — el valor de vivienda trae ceros de menos

En el Excel, `523.620` **no** son 523 mil pesos: son ~523.620.000. La columna está
en miles.

- Se corrige **una sola vez**, en `common.normalize_housing_value(raw)`.
- La heurística es idempotente: por debajo de 10.000.000 se multiplica por 1.000;
  por encima se asume que ya viene en pesos. Reprocesar un archivo normalizado no
  lo daña.
- Si el resultado cae fuera del rango plausible (30M – 3.000M) **no se corrige en
  silencio**: la fila se marca como sospechosa y aparece en el reporte de calidad.
- A partir de ahí, todo lo que cruza el contrato (`COP`) está en **pesos enteros**.
  `05_export_artifacts.py` aborta si detecta un precio por debajo de 10 millones,
  y el frontend solo formatea: nunca multiplica ni divide.

### Trampa #2 — los porcentajes de estrato no suman 100%

La distribución de estrato del dataset está incompleta. Un peso construido sobre
una variable cuya distribución no cierra es indefendible ante un jurado y, peor,
sería regresivo: el estrato es un proxy socioeconómico que castigaría
sistemáticamente a los hogares que este reto quiere habilitar.

Consecuencias, que son reglas y no recomendaciones:

- `weights.json` **no puede contener ninguna clave `estrato`**. Lo verifica
  `common.assert_sin_estrato`, que corre en la etapa 3 y otra vez en la 5.
- `estrato` tampoco entra en `perfilComprador` de `ProjectProfile`, ni como
  atributo descriptivo, para que nadie lo promueva a variable más adelante.
- Si el estrato se usa en algún momento, es solo como **contexto de lectura** en
  una nota, nunca como insumo del número.

---

## 4. Reglas de negocio que el pipeline codifica

**Regla 90/10.** Por regulación, alrededor del **90% de las ventas de vivienda de
la caja deben ir a afiliados**. No es una preferencia comercial: ordena el embudo.
El pipeline la sirve por dos vías:

1. `afiliacion` es el factor de mayor peso esperado del score, y `proporcionAfiliados`
   se publica por proyecto como insumo de elegibilidad.
2. El backend la aplica en `filterByEligibility` (F1) y alerta el cupo en
   `buildAlerts` (F4). El pipeline aporta el dato; la decisión sigue siendo
   determinista y en código.

**Umbral de 4 SMMLV del Subsidio Familiar de Vivienda.** Un hogar con ingresos
≤ 4 SMMLV aspira al SFV (con SMMLV 2026 = $1.623.500, el tope son ~$6.494.000
mensuales). Es la bisagra del carril de nutrición: por debajo del tope, el
subsidio cierra buena parte del `gap = precio − ahorro − subsidio`, y un lead
que hoy no es viable **sí es educable a viable**. `common.aplica_subsidio` y
`TOPE_SFV_SMMLV` son la única fuente de ese umbral en el pipeline.

**VIS.** Un proyecto cuenta como Vivienda de Interés Social bajo 150 SMMLV
(~$243.525.000 en 2026). Lo marca `common.es_vis` y viaja en `ProjectProfile.esVIS`.

---

## 5. Nota metodológica (la versión honesta)

**Target.** `compra_vigente = 1` cuando la fila registra una compra **y**
`fecha_desistimiento` está vacía; `0` cuando la compra se desistió. Una sola
definición, escrita en un solo lugar (`02_label_target.py`).

**Sesgo de selección, dicho en voz alta.** El dataset contiene **compradores, no
leads**: no hay controles negativos de personas que consultaron y nunca
compraron. Por lo tanto el modelo **no** estima "probabilidad de conversión" en
abstracto; estima **probabilidad de que una compra con este perfil se sostenga**,
y lo usamos como proxy de calidad de lead. Es una limitación real del dato
disponible y se declara así en la demo. Un equipo que presente esto como un
modelo de conversión está sobrevendiendo.

**Censura a la derecha.** Una opción firmada hace tres semanas todavía no tuvo
tiempo de desistir. Etiquetarla como vigente inyecta optimismo falso, así que
`excluir_desistimientos_en_curso` descarta las compras dentro de un período de
gracia (90 días por defecto).

**Ventana temporal.** Solo los últimos 4 años (`--ventana-anios`). El mercado de
vivienda de hace seis años (tasas, subsidio, precios) no explica el de hoy.
Acortar la ventana cuesta filas y compra validez.

**Validación con n = 4.142 y clase desbalanceada.** Los desistimientos son la
clase minoritaria, así que:

- Se reporta **AUC**, no accuracy. Con prevalencia desbalanceada, un modelo que
  predice "vigente" siempre saca buena accuracy y es inútil.
- Se valida con **k-fold estratificado (k = 5)** y se reporta **media ± desviación**,
  además de un **holdout estratificado del 25%** como control. Un solo holdout a
  este tamaño de muestra deja una banda de error demasiado ancha para presentarla
  como un número seco.
- La estratificación es por target **y por proyecto**: sin eso, un proyecto grande
  puede caer entero en test y el AUC termina midiendo el proyecto, no el perfil.
- El entrenamiento usa `class_weight='balanced'`.
- `ScoringWeights.calibracion` publica `{ metrica: 'AUC', valor, n }` para que el
  número sea citable y auditable. Un artefacto con `n = 0` **no está calibrado**;
  la etapa 5 lo rechaza.

**Por qué regresión logística y no un ensemble.** Decisión de arquitectura, no de
gusto. El modelo lineal entrega un coeficiente por factor, y ese coeficiente **es**
el peso que el backend muestra en `Factor.peso` y `Factor.contribucion`, y que el
frontend pinta en `FactorBars`. Un gradient boosting daría uno o dos puntos de AUC
y a cambio dejaría al closer sin poder responder _"¿por qué este lead es 78?"_
delante del cliente. El reto exige explicabilidad: **un modelo de caja negra
descalifica el principio glass-box**, y además un score de crédito-adyacente
opaco es un problema de defensa ante el titular del dato, no solo de estética.

**Forma de los pesos.**

- Se normalizan para que **la suma de valores absolutos sea 1.0**.
- Se **conserva el signo**: hay factores que restan (por ejemplo `personas_a_cargo`)
  y perder el signo mataría la lectura de "qué suma y qué resta".
- Solo se calibran factores que la conversación de F1 puede preguntar
  (`FACTORES_PERMITIDOS`). Calibrar contra una columna del Excel que el lead nunca
  informa deja al score sin insumo en producción; `assert_factores_permitidos` lo
  bloquea.
- Codificación pensada para que el coeficiente siga siendo legible: binarias 0/1,
  el rango salarial como punto medio en SMMLV (ordinal, preserva el orden y deja
  **un** peso por factor en vez de cinco columnas one-hot), y los montos en SMMLV
  en lugar de pesos para que el peso no dependa de la inflación del año.

**Umbral de viabilidad.** `umbralViable` no maximiza accuracy: los dos errores
cuestan distinto. Un falso positivo le quema una llamada al closer; un falso
negativo solo manda al lead al carril de nutrición, donde puede volver a
clasificarse como viable. El corte se elige favoreciendo precisión en el carril
viable, y queda documentado en la corrida.

**Versionado.** `ScoringWeights.version` sube en cada recalibración y viaja en
`ScoreResult.weightsVersion`. Así un score de la semana pasada se puede explicar
con los pesos de la semana pasada.

---

## 6. Límites legales y de alcance

Requisitos, no adornos. Aplican al pipeline y a quien lo corra.

- **Ley 1581 de 2012 (habeas data) y Decreto 1377 de 2013.** El tratamiento exige
  consentimiento previo, expreso e informado, y finalidad acotada. El pipeline
  trabaja sobre datos históricos **anonimizados y agregados**; lo que se publica
  en `data/` son proporciones, nunca filas.
- **Sin cédulas ni documentos.** El Excel llega anonimizado y
  `common.assert_no_pii(df)` **aborta la corrida** si aparece una columna cuyo
  nombre contenga `cedula`, `documento`, `identificacion`, `nit`, `telefono`,
  `celular`, `movil`, `whatsapp`, `email`, `correo`, `direccion`, `nombre` o
  `apellido`. La comparación se hace sobre el encabezado normalizado (minúsculas,
  sin tildes), así que `Cédula` también cae.
- **Sin PII en el repo.** `.gitignore` excluye `analysis/raw/` y todo `.xlsx`,
  `.xls`, `.csv` y `.pptx` bajo `analysis/`. Los notebooks se comitean **con las
  salidas limpias**: una celda con `df.head()` es PII entrando por la puerta de
  atrás.
- **Sin scraping.** Todo sale de archivos entregados por la organización. Por eso
  `requirements.txt` no trae `requests`, `httpx`, `beautifulsoup4` ni `selenium`:
  si alguien necesita agregar un cliente HTTP aquí, es señal de que se salió del
  alcance.
- **Sin DataCrédito ni bureau de crédito.** La capacidad de pago se **estima** con
  lo que el lead declara (ingreso, ahorro, capacidad de ahorro mensual, personas a
  cargo). No se consulta ni se simula una consulta a centrales de riesgo, y el
  código lo dice donde aplica (`estimateCapacity` en F1).
- **k-anonimato barato.** Un proyecto con menos de `MIN_COMPRADORES_POR_PROYECTO`
  (20) compradores no publica su distribución: un grupo demasiado chico deja de
  ser un agregado y se vuelve reidentificable.
- **Sin secretos.** El pipeline no necesita ninguna credencial. Si un script llega
  a pedir una API key, está haciendo algo que no le corresponde.

---

## 7. Checklist antes de publicar a `data/`

`05_export_artifacts.py` lo verifica, pero conviene saber qué está mirando:

1. `assert_no_pii` pasó en la etapa 1.
2. `weights.json` sin ninguna clave `estrato` y sin factores fuera de
   `FACTORES_PERMITIDOS`.
3. Suma de |pesos| = 1.0 (tolerancia numérica) y signos conservados.
4. `calibracion.n > 0` y `umbralViable` en 0-100.
5. Precios en pesos enteros: ningún precio por debajo de 10 millones.
6. Cada distribución de `perfilComprador` suma 1.0.
7. Proyectos por debajo del mínimo de compradores omitidos y reportados.
8. Flag `placeholder` y `_aviso` removidos.
9. `version` de los pesos incrementada.

---

## 8. Pendientes y propuestas al equipo

- **`RANGOS_SALARIALES_SMMLV` y `SEGMENTOS_FAMILIARES`** siguen abiertos como
  `string | null` en el contrato (adenda A7). El vocabulario real sale del Excel;
  cuando la etapa 1 lo confirme, se anuncia al equipo y **entonces** se cierra el
  tipo. Mientras tanto, el mapeo tentativo vive en `BANDAS_SALARIALES_SMMLV`.
- **PROPUESTA AL EQUIPO:** `.gitignore` excluye el directorio `analysis/raw/`
  completo, así que `analysis/raw/.gitkeep` tampoco entra a git. Para que la
  carpeta exista en un clon limpio hace falta la excepción `!analysis/raw/.gitkeep`.
  No la agregamos desde aquí porque ese archivo tiene dueño único; mientras no
  esté, la etapa 1 debe crear la carpeta.
- **Columnas del Excel que todavía no se usan** (`etapa`, `categoria`,
  `empresa_ranking`, `foco`, `entidad_financiera`): se mantienen en el parquet
  limpio para explorarlas, pero **no** entran al score hasta que la conversación
  de F1 pueda preguntarlas o derivarlas sin fricción.
