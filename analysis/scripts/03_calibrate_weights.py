"""Etapa 3 - calibra los pesos del score contra los compradores reales.

Entrada : analysis/raw/_interim/compradores_etiquetados.parquet
Salida  : analysis/raw/_interim/weights_calibrados.json (payload ScoringWeights)

POR QUE REGRESION LOGISTICA Y NO UN ENSEMBLE (decision de arquitectura, no de
gusto): el reto exige explicabilidad y el sistema es glass-box. Un modelo lineal
entrega un coeficiente por factor, y ese coeficiente ES el peso que el backend
muestra en `Factor.peso` / `Factor.contribucion`. Un gradient boosting daria uno
o dos puntos de AUC y a cambio dejaria al closer sin poder responder "por que
este lead es 78" delante del cliente. Eso descalifica el principio glass-box.

GLASS-BOX: este script produce numeros, no decisiones. La decision de carril la
toma `routing.ts` en el backend, con estos pesos y un umbral, de forma
determinista. Ningun LLM interviene aqui ni en el scoring.

TRAMPA DE DATOS #2: `estrato` NO entra como feature. Los porcentajes de estrato
del dataset no suman 100%, asi que un peso sobre estrato seria indefendible.
`assert_sin_estrato` corta la corrida si alguien lo cuela.

Uso:
    python analysis/scripts/03_calibrate_weights.py --folds 5 --semilla 42
"""

from __future__ import annotations

import argparse
from typing import Mapping, Sequence

import pandas as pd
from sklearn.linear_model import LogisticRegression

from common import (
    TARGET_COLUMN,
    WEIGHTS_CALIBRADOS,
    assert_factores_permitidos,
    assert_sin_estrato,
)

#: Version que se estampa en `ScoringWeights.version`. Subirla en cada
#: recalibracion: es lo que hace auditable un score viejo.
VERSION_WEIGHTS: str = "1.0.0"

#: Semilla fija para que dos corridas den los mismos pesos. Reproducibilidad no
#: negociable: el jurado puede pedir la misma tabla dos veces.
SEMILLA_POR_DEFECTO: int = 42


def construir_matriz_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Arma X (features) y y (target) desde el parquet etiquetado.

    Solo produce columnas cuyo nombre este en `FACTORES_PERMITIDOS`: si la
    conversacion de F1 no puede preguntar el dato, no puede ser feature, porque
    en produccion el score se quedaria sin insumo.

    Codificacion pensada para que el coeficiente siga siendo legible:
      * `afiliacion`, `ciudad_con_proyecto` -> binarias 0/1.
      * `rango_salarial` -> punto medio de la banda en SMMLV (ordinal, no
        one-hot: preserva el orden y deja UN peso por factor).
      * `ahorro_declarado`, `capacidad_ahorro_mensual` -> en SMMLV, no en pesos,
        para que el peso no dependa de la inflacion del ano.
      * `personas_a_cargo` -> entero.
      * `segmento`, `segmento_familiar` -> ordinal por prevalencia de compra
        vigente observada, documentado en el README.
    """
    raise NotImplementedError


def entrenar_regresion_logistica(
    features: pd.DataFrame,
    target: pd.Series,
    semilla: int = SEMILLA_POR_DEFECTO,
) -> LogisticRegression:
    """Entrena el modelo interpretable.

    `class_weight='balanced'` porque la clase de desistimiento es minoritaria;
    sin eso el modelo aprende a predecir "vigente" siempre y el AUC se sostiene
    solo en la prevalencia.
    """
    raise NotImplementedError


def validar_holdout(
    features: pd.DataFrame,
    target: pd.Series,
    proporcion_test: float = 0.25,
    semilla: int = SEMILLA_POR_DEFECTO,
) -> dict[str, float]:
    """AUC sobre un holdout estratificado. Devuelve AUC, N test y prevalencia.

    Estratificado por el target y por proyecto: sin estratificar por proyecto,
    un proyecto grande puede caer entero en test y el AUC mide otra cosa.
    """
    raise NotImplementedError


def validar_kfold(
    features: pd.DataFrame,
    target: pd.Series,
    folds: int = 5,
    semilla: int = SEMILLA_POR_DEFECTO,
) -> dict[str, float]:
    """AUC por k-fold estratificado. Devuelve media y desviacion.

    Con n=4.142 y clase desbalanceada, un solo holdout da un AUC con banda de
    error amplia; el k-fold permite reportar media +/- desviacion, que es lo
    honesto a este tamano de muestra.
    """
    raise NotImplementedError


def coeficientes_a_pesos(
    modelo: LogisticRegression,
    columnas: Sequence[str],
) -> dict[str, float]:
    """Traduce coeficientes a pesos normalizados para `weights.json`.

    Se normaliza para que la suma de valores absolutos sea 1.0 (documentado en
    el README) y se conserva el SIGNO: el frontend pinta con `FactorBars` los
    factores que suman y los que restan, y perder el signo mataria esa lectura.
    """
    raise NotImplementedError


def elegir_umbral_viable(target: pd.Series, probabilidades: pd.Series) -> int:
    """Elige `umbralViable` (0-100) para el corte viable / no_viable.

    No se optimiza accuracy: se busca el punto donde el carril viable mantiene
    precision alta, porque un falso positivo le quema una llamada al closer,
    mientras un falso negativo solo manda al lead a nutricion (donde igual se
    puede reclasificar). El costo de los dos errores no es simetrico.
    """
    raise NotImplementedError


def construir_scoring_weights(
    pesos: Mapping[str, float],
    umbral_viable: int,
    metrica: str,
    valor_metrica: float,
    n: int,
) -> dict[str, object]:
    """Arma el payload que valida contra `ScoringWeights` de contracts.ts.

    Corre `assert_sin_estrato` y `assert_factores_permitidos` antes de devolver:
    el guardarrail va en la frontera de salida, no en la confianza del autor.
    """
    raise NotImplementedError


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada CLI. Devuelve 0 si la etapa termino limpia."""
    raise NotImplementedError


def _construir_parser() -> argparse.ArgumentParser:
    """Define `--folds`, `--semilla`, `--proporcion-test` y `--output`."""
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
