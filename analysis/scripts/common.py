"""Utilidades compartidas del pipeline offline de analisis (perfilador de vivienda).

Este modulo concentra: rutas del pipeline, vocabulario canonico de columnas,
constantes de negocio (SMMLV, tope SFV, cuota 90/10) y los dos guardarrailes
que hacen defendible el dataset: `assert_no_pii` (Ley 1581 de 2012) y
`assert_sin_estrato` (trampa de datos #2).

GLASS-BOX: aqui NO se decide nada. Este modulo solo limpia, normaliza y
valida. El scoring que sale del pipeline es un modelo lineal legible; ningun
LLM y ningun ensemble opaco participa en la calibracion.

Los cuerpos van con `raise NotImplementedError`: el scaffolding fija las
firmas para que 5 personas puedan implementar en paralelo sin colisionar.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, Mapping, Sequence

import pandas as pd

# ---------------------------------------------------------------------------
# Rutas del pipeline
# ---------------------------------------------------------------------------

#: `analysis/` (este archivo vive en `analysis/scripts/`).
ANALYSIS_DIR: Final[Path] = Path(__file__).resolve().parent.parent

#: Raiz del repo backend.
REPO_ROOT: Final[Path] = ANALYSIS_DIR.parent

#: Fuentes crudas (Excel de compradores, PPT de buyer personas, brochure).
#: NUNCA se comitean: `.gitignore` excluye todo `analysis/raw/`.
RAW_DIR: Final[Path] = ANALYSIS_DIR / "raw"

#: Intermedios de cada etapa. Vive DENTRO de `raw/` a proposito: asi queda
#: cubierto por el `.gitignore` existente y es imposible comitear por error un
#: derivado fila-a-fila de los 4.142 compradores.
INTERIM_DIR: Final[Path] = RAW_DIR / "_interim"

#: Artefactos publicables que consume el backend (agregados, sin PII).
DATA_DIR: Final[Path] = REPO_ROOT / "data"

# Nombres de archivo por etapa (contrato interno del pipeline).
COMPRADORES_LIMPIOS: Final[Path] = INTERIM_DIR / "compradores_limpios.parquet"
COMPRADORES_ETIQUETADOS: Final[Path] = INTERIM_DIR / "compradores_etiquetados.parquet"
WEIGHTS_CALIBRADOS: Final[Path] = INTERIM_DIR / "weights_calibrados.json"
PERFILES_CALCULADOS: Final[Path] = INTERIM_DIR / "project_profiles_calculados.json"
WEIGHTS_JSON: Final[Path] = DATA_DIR / "weights.json"
PROJECT_PROFILES_JSON: Final[Path] = DATA_DIR / "project_profiles.json"

# ---------------------------------------------------------------------------
# Constantes de negocio (deben coincidir con src/shared/contracts.ts)
# ---------------------------------------------------------------------------

#: Salario Minimo Mensual Legal Vigente 2026, en pesos.
SMMLV_2026: Final[int] = 1_623_500

#: Tope de ingresos del hogar para aspirar al Subsidio Familiar de Vivienda.
TOPE_SFV_SMMLV: Final[int] = 4

#: Techo de precio para que una vivienda cuente como VIS, en SMMLV.
TOPE_VIS_SMMLV: Final[int] = 150

#: Regla 90/10: por regulacion, ~90% de las ventas de vivienda de la caja
#: deben ir a afiliados. Ordena el embudo, no es un adorno del score.
CUOTA_AFILIADOS_MINIMA: Final[float] = 0.90

#: k-anonimato barato: por debajo de este N no publicamos la distribucion de
#: un proyecto, porque un grupo chico deja de ser un agregado.
MIN_COMPRADORES_POR_PROYECTO: Final[int] = 20

# ---------------------------------------------------------------------------
# TRAMPA DE DATOS #1 - escala del valor de vivienda
# ---------------------------------------------------------------------------

#: El Excel trae el valor en miles: `523.620` significa ~523.620.000 pesos.
ESCALA_VALOR_VIVIENDA: Final[int] = 1_000

#: Por encima de esto asumimos que el valor YA viene en pesos enteros
#: (hace `normalize_housing_value` idempotente y tolera fuentes mixtas).
UMBRAL_VALOR_YA_EN_PESOS: Final[int] = 10_000_000

#: Rango plausible de una vivienda en Colombia. Fuera de esto no se corrige en
#: silencio: se reporta como fila sucia.
VALOR_VIVIENDA_MIN_PLAUSIBLE: Final[int] = 30_000_000
VALOR_VIVIENDA_MAX_PLAUSIBLE: Final[int] = 3_000_000_000

# ---------------------------------------------------------------------------
# Vocabulario canonico
# ---------------------------------------------------------------------------

#: Encabezado del Excel (ya normalizado a minusculas y sin tildes) -> nombre
#: canonico snake_case usado en todo el pipeline. Mapear explicito y no
#: adivinar: si el Excel cambia un encabezado, queremos que falle ruidoso.
COLUMNAS_CANONICAS: Final[Mapping[str, str]] = {
    "proyecto": "proyecto",
    "etapa": "etapa",
    "codigo": "codigo_unidad",
    "fecha de opcion": "fecha_opcion",
    "fecha de desistimiento": "fecha_desistimiento",
    "entidad financiera": "entidad_financiera",
    "medio por el que se entero": "medio_conocimiento",
    "valor de vivienda": "valor_vivienda",
    "afiliado si/no": "afiliado",
    "segmento": "segmento",
    "categoria": "categoria",
    "rango salarial": "rango_salarial",
    "personas a cargo": "personas_a_cargo",
    "empresa/piramide/ranking": "empresa_ranking",
    "foco": "foco",
}

#: Nombre de la columna objetivo que produce `02_label_target.py`.
TARGET_COLUMN: Final[str] = "compra_vigente"

#: Bandas salariales en SMMLV. Debe coincidir con `RANGOS_SALARIALES_SMMLV`
#: del contrato; si el Excel trae otro vocabulario, se mapea aqui y se anuncia
#: al equipo antes de cerrar el tipo (adenda A7 del contrato).
BANDAS_SALARIALES_SMMLV: Final[Mapping[str, tuple[float, float]]] = {
    "0-2 SMMLV": (0.0, 2.0),
    "2-4 SMMLV": (2.0, 4.0),
    "4-6 SMMLV": (4.0, 6.0),
    "6-10 SMMLV": (6.0, 10.0),
    ">10 SMMLV": (10.0, 16.0),
}

#: Factores que puede contener `weights.json`. Son los unicos observables por
#: la conversacion de F1 (ver `Slot` en contracts.ts) mas la ciudad con oferta.
#: Cualquier factor fuera de esta lista no se puede pedir en el chat, asi que
#: no puede entrar al score.
FACTORES_PERMITIDOS: Final[tuple[str, ...]] = (
    "afiliacion",
    "rango_salarial",
    "capacidad_ahorro_mensual",
    "ahorro_declarado",
    "ciudad_con_proyecto",
    "segmento",
    "segmento_familiar",
    "personas_a_cargo",
)

# ---------------------------------------------------------------------------
# TRAMPA DE DATOS #2 y Ley 1581 - listas de bloqueo
# ---------------------------------------------------------------------------

#: Fragmentos prohibidos en nombres de columna. Si el crudo llega con alguno,
#: el pipeline se detiene: preferimos no correr antes que tratar PII.
PII_FRAGMENTOS_PROHIBIDOS: Final[tuple[str, ...]] = (
    "cedula",
    "documento",
    "identificacion",
    "nit",
    "telefono",
    "celular",
    "movil",
    "whatsapp",
    "email",
    "correo",
    "direccion",
    "nombre",
    "apellido",
)

#: El estrato NO es variable dura del score (trampa #2: los porcentajes de
#: estrato del dataset no suman 100%). Se bloquea por nombre, no por confianza.
ESTRATO_FRAGMENTOS_PROHIBIDOS: Final[tuple[str, ...]] = ("estrato", "stratum")


class PiiDetectedError(RuntimeError):
    """El dataset trae una columna que parece dato personal identificable.

    Se lanza en `assert_no_pii`. Es un corte duro del pipeline: la Ley 1581 de
    2012 no admite "seguir con cuidado".
    """


class EstratoProhibidoError(RuntimeError):
    """Aparecio `estrato` como feature o como peso del score.

    Trampa de datos #2: la distribucion de estrato del dataset esta incompleta,
    asi que usarla como variable dura produciria un score indefendible.
    """


class DatoFueraDeRangoError(ValueError):
    """Un valor numerico quedo fuera del rango plausible tras normalizar."""


def normalizar_encabezado(nombre: str) -> str:
    """Baja a minusculas, quita tildes y colapsa espacios de un encabezado.

    Existe para que `assert_no_pii` y `COLUMNAS_CANONICAS` funcionen igual con
    "Cedula", "CEDULA" y "cedula": la lista de bloqueo no puede depender de
    como escribio el encabezado quien exporto el Excel.
    """
    raise NotImplementedError


def renombrar_columnas(df: pd.DataFrame) -> pd.DataFrame:
    """Aplica `COLUMNAS_CANONICAS`. Falla si falta una columna esperada."""
    raise NotImplementedError


def assert_no_pii(df: pd.DataFrame) -> None:
    """Aborta el pipeline si el DataFrame trae columnas de dato personal.

    Compara cada encabezado normalizado contra `PII_FRAGMENTOS_PROHIBIDOS`.
    El dataset del reto llega anonimizado (sin cedulas), y este chequeo es lo
    que mantiene esa promesa verificable en cada corrida en vez de confiar en
    la memoria de quien exporto el archivo.

    Raises:
        PiiDetectedError: si algun encabezado contiene un fragmento prohibido.
    """
    raise NotImplementedError


def assert_sin_estrato(pesos: Mapping[str, float]) -> None:
    """Aborta si `weights.json` contiene alguna clave de estrato.

    Trampa de datos #2. Se valida sobre el diccionario de pesos y no sobre el
    modelo, porque lo que se exporta al backend es el diccionario.

    Raises:
        EstratoProhibidoError: si aparece una clave con `estrato`/`stratum`.
    """
    raise NotImplementedError


def assert_factores_permitidos(pesos: Mapping[str, float]) -> None:
    """Aborta si hay un peso para un factor que la conversacion no puede pedir.

    Evita el error clasico de calibrar contra una columna del Excel que el lead
    nunca va a informar en el chat: el score quedaria sin insumo en produccion.
    """
    raise NotImplementedError


def normalize_housing_value(raw: object) -> int | None:
    """Normaliza el valor de vivienda a pesos enteros. TRAMPA DE DATOS #1.

    En el Excel de compradores el valor viene en miles: `523.620` significa
    ~523.620.000 pesos. La correccion ocurre UNA sola vez, aqui. Todo lo que
    sale hacia `data/` y hacia el contrato ya viene en pesos enteros; ni el
    backend ni el frontend vuelven a multiplicar ni dividir.

    Heuristica (deliberadamente conservadora e idempotente):
      * `None`/vacio -> `None`.
      * valor < `UMBRAL_VALOR_YA_EN_PESOS` -> se multiplica por
        `ESCALA_VALOR_VIVIENDA` (venia en miles).
      * valor >= `UMBRAL_VALOR_YA_EN_PESOS` -> se asume ya en pesos y se deja
        igual, para que reprocesar un archivo ya normalizado no lo dane.

    Args:
        raw: celda cruda del Excel (numero, texto con separadores, o vacio).

    Returns:
        Pesos colombianos enteros, o `None` si la celda venia vacia.

    Raises:
        DatoFueraDeRangoError: si el resultado sale del rango plausible
            (`VALOR_VIVIENDA_MIN_PLAUSIBLE`..`VALOR_VIVIENDA_MAX_PLAUSIBLE`).
            No se corrige en silencio: la fila se reporta como sucia.
    """
    raise NotImplementedError


def parse_fecha(raw: object) -> pd.Timestamp | None:
    """Convierte una celda de fecha a `Timestamp`, o `None` si esta vacia.

    Critico para `02_label_target.py`: "fecha de desistimiento vacia" es la
    mitad de la definicion del target, asi que un vacio mal leido (por ejemplo
    la cadena "N/A" o "-") invertiria la etiqueta.
    """
    raise NotImplementedError


def parse_afiliado(raw: object) -> bool | None:
    """Convierte la columna afiliado si/no a booleano. `None` si es ambigua."""
    raise NotImplementedError


def rango_salarial_a_smmlv(rango: object) -> tuple[float, float] | None:
    """Traduce una banda salarial de texto a sus limites en SMMLV.

    Devuelve `None` si la banda no esta en `BANDAS_SALARIALES_SMMLV`, para que
    el vocabulario desconocido se cuente y se reporte en vez de imputarse.
    """
    raise NotImplementedError


def aplica_subsidio(ingreso_smmlv: float) -> bool:
    """`True` si el hogar esta en el tope del SFV (<= `TOPE_SFV_SMMLV`).

    El umbral de 4 SMMLV del Subsidio Familiar de Vivienda es la bisagra del
    carril de nutricion: por debajo de el, el subsidio cierra buena parte del
    gap y el lead es educable a viable.
    """
    raise NotImplementedError


def es_vis(valor_normalizado: int) -> bool:
    """`True` si el precio en pesos cae bajo el techo VIS (`TOPE_VIS_SMMLV`)."""
    raise NotImplementedError


def leer_parquet(origen: Path) -> pd.DataFrame:
    """Lee un intermedio del pipeline. Falla con mensaje claro si no existe."""
    raise NotImplementedError


def escribir_parquet(df: pd.DataFrame, destino: Path) -> Path:
    """Escribe un intermedio bajo `INTERIM_DIR`, creando el directorio.

    Rechaza destinos fuera de `INTERIM_DIR`: los derivados fila-a-fila no
    pueden terminar en una carpeta versionable.
    """
    raise NotImplementedError


def escribir_json(payload: Mapping[str, object] | Sequence[object], destino: Path) -> Path:
    """Escribe JSON UTF-8 indentado y con salto final (amable con git diff)."""
    raise NotImplementedError


def ahora_iso() -> str:
    """Marca de tiempo ISO-8601 en UTC con milisegundos y sufijo `Z`.

    Alimenta `generadoEn` de `ScoringWeights`, que es lo que hace auditable un
    score en el tiempo.
    """
    raise NotImplementedError


def resumen_calidad(df: pd.DataFrame) -> pd.DataFrame:
    """Tabla de calidad por columna: nulos, unicos y vocabulario inesperado.

    Se imprime al final de cada etapa. Es el insumo honesto para decir ante el
    jurado cuantas filas se descartaron y por que.
    """
    raise NotImplementedError
