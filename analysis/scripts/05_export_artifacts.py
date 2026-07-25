"""Etapa 5 - publica los artefactos que consume el backend.

Entrada : analysis/raw/_interim/weights_calibrados.json
          analysis/raw/_interim/project_profiles_calculados.json
Salida  : data/weights.json  y  data/project_profiles.json

Es la unica etapa que escribe fuera de `analysis/`, y por eso es la que valida
mas duro. Antes de publicar:
  1. Verifica la forma contra `ScoringWeights` / `ProjectProfile[]` del contrato
     (`src/shared/contracts.ts`). El backend revalida con zod, pero fallar aqui
     cuesta segundos y fallar alla cuesta una demo.
  2. Corre `assert_sin_estrato` (trampa #2) y `assert_factores_permitidos`.
  3. Confirma que ningun valor de precio quedo bajo 10 millones, es decir que la
     trampa #1 ya se corrigio aguas arriba. Este script NO reescala nada: si el
     valor llega mal, aborta.
  4. Quita el flag `placeholder`. Mientras el flag este presente, el adapter
     `file-data-catalog.adapter.ts` responde `DATA_UNAVAILABLE` a proposito, y
     asi el backend nunca sirve un score inventado como si fuera calibrado.

Uso:
    python analysis/scripts/05_export_artifacts.py --dry-run
    python analysis/scripts/05_export_artifacts.py
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Mapping, Sequence

from common import (
    PERFILES_CALCULADOS,
    PROJECT_PROFILES_JSON,
    WEIGHTS_CALIBRADOS,
    WEIGHTS_JSON,
    assert_factores_permitidos,
    assert_sin_estrato,
)

#: Claves obligatorias de `ScoringWeights`.
CLAVES_SCORING_WEIGHTS: tuple[str, ...] = (
    "version",
    "pesos",
    "umbralViable",
    "calibracion",
    "generadoEn",
)

#: Claves obligatorias de `ProjectProfile`.
CLAVES_PROJECT_PROFILE: tuple[str, ...] = (
    "proyectoId",
    "nombre",
    "ciudad",
    "zona",
    "precioDesde",
    "precioHasta",
    "esVIS",
    "perfilComprador",
    "proporcionAfiliados",
)

#: Zonas admitidas por el contrato.
ZONAS_VALIDAS: tuple[str, ...] = ("norte", "sur", "centro", "otra")


def validar_scoring_weights(payload: Mapping[str, object]) -> None:
    """Valida forma, rangos y guardarrailes del payload de pesos.

    Chequea: claves obligatorias, `umbralViable` en 0-100, `calibracion.n` > 0
    (un artefacto con n=0 no esta calibrado), suma de |pesos| == 1.0 dentro de
    tolerancia, y ausencia de estrato.

    Raises:
        ValueError: si la forma o los rangos no cuadran.
        EstratoProhibidoError: si aparece un peso de estrato.
    """
    raise NotImplementedError


def validar_project_profiles(perfiles: Sequence[Mapping[str, object]]) -> None:
    """Valida cada `ProjectProfile`: claves, zona, precios y proporciones.

    Incluye el chequeo de que los precios ya vengan en pesos enteros (trampa #1
    corregida aguas arriba) y que cada distribucion de `perfilComprador` sume
    1.0 dentro de tolerancia.
    """
    raise NotImplementedError


def quitar_marcas_de_placeholder(payload: Mapping[str, object]) -> dict[str, object]:
    """Devuelve el payload sin `placeholder` ni `_aviso`.

    Publicar con el flag puesto es peor que no publicar: el backend seguiria
    respondiendo `DATA_UNAVAILABLE` y nadie sabria por que.
    """
    raise NotImplementedError


def exportar_weights(origen: Path = WEIGHTS_CALIBRADOS, destino: Path = WEIGHTS_JSON) -> Path:
    """Valida y escribe `data/weights.json`. Devuelve la ruta escrita."""
    raise NotImplementedError


def exportar_project_profiles(
    origen: Path = PERFILES_CALCULADOS,
    destino: Path = PROJECT_PROFILES_JSON,
) -> Path:
    """Valida y escribe `data/project_profiles.json`.

    Conserva el envoltorio `{ "proyectos": [...] }` documentado en
    `data/README.md`: existe solo para poder marcar `placeholder` a nivel de
    archivo, cosa que un array JSON no permite.
    """
    raise NotImplementedError


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada CLI. Con `--dry-run` valida y no escribe nada."""
    raise NotImplementedError


def _construir_parser() -> argparse.ArgumentParser:
    """Define `--dry-run`, `--weights` y `--profiles`."""
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
