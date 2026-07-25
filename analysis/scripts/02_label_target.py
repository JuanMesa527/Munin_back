"""Etapa 2 - etiqueta el target de entrenamiento.

Entrada : analysis/raw/_interim/compradores_limpios.parquet
Salida  : analysis/raw/_interim/compradores_etiquetados.parquet

DEFINICION DEL TARGET (una sola, escrita una sola vez):
    compra_vigente = 1  <=>  la fila registra una compra Y `fecha_desistimiento`
                             esta vacia.
    compra_vigente = 0  <=>  la fila registra una compra que despues se
                             desistio (tiene `fecha_desistimiento`).

SESGO DE SELECCION, dicho en voz alta: el dataset contiene compradores, no
leads. No hay controles negativos de gente que consulto y nunca compro. Por eso
el modelo NO estima "probabilidad de conversion" en abstracto: estima
"probabilidad de que una compra con este perfil se sostenga". Lo usamos como
proxy de calidad de lead, y el README lo declara asi ante el jurado.

Uso:
    python analysis/scripts/02_label_target.py --ventana-anios 4
"""

from __future__ import annotations

import argparse
from typing import Sequence

import pandas as pd

from common import COMPRADORES_ETIQUETADOS, TARGET_COLUMN


def es_compra_vigente(fila: pd.Series) -> bool:
    """`True` si la fila es compra con `fecha_desistimiento` vacia.

    Unica fuente de verdad de la etiqueta. Cualquier otro script que necesite
    el target lo lee de la columna, no lo recalcula.
    """
    raise NotImplementedError


def filtrar_ventana_temporal(df: pd.DataFrame, ventana_anios: int = 4) -> pd.DataFrame:
    """Deja solo las opciones de los ultimos N anios segun `fecha_opcion`.

    El mercado de vivienda de 2019 no explica el de hoy (tasas, subsidio,
    precios). Acotar la ventana cuesta filas pero compra validez.
    """
    raise NotImplementedError


def excluir_desistimientos_en_curso(df: pd.DataFrame, dias_gracia: int = 90) -> pd.DataFrame:
    """Quita compras demasiado recientes para saber si se sostienen.

    Censura a la derecha: una opcion firmada la semana pasada aun no tuvo tiempo
    de desistir, asi que etiquetarla como vigente meteria optimismo falso.
    """
    raise NotImplementedError


def etiquetar_target(df: pd.DataFrame) -> pd.DataFrame:
    """Agrega la columna `compra_vigente` (0/1) usando `es_compra_vigente`."""
    raise NotImplementedError


def resumen_balance(df: pd.DataFrame, columna: str = TARGET_COLUMN) -> dict[str, float]:
    """Prevalencia de cada clase, N total y N por clase.

    Se imprime siempre: con clase desbalanceada, reportar accuracy sin mirar la
    prevalencia es como no reportar nada.
    """
    raise NotImplementedError


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada CLI. Devuelve 0 si la etapa termino limpia."""
    raise NotImplementedError


def _construir_parser() -> argparse.ArgumentParser:
    """Define `--ventana-anios`, `--dias-gracia` y `--output`."""
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
