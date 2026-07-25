"""Etapa 4 - construye el buyer persona real de cada proyecto.

Entrada : analysis/raw/_interim/compradores_etiquetados.parquet
          analysis/raw/catalogo_proyectos.json  (ciudad y zona, transcritas a
          mano del brochure y de los PPT de buyer personas)
Salida  : analysis/raw/_interim/project_profiles_calculados.json

De aqui sale `ProjectProfile[]`, que es lo que le da credibilidad al matching:
la similitud del lead no se compara contra un persona inventado por nosotros,
se compara contra la distribucion de quienes SI compraron en ese proyecto y
sostuvieron la compra.

PRIVACIDAD: la salida es agregada (proporciones), nunca filas. Proyectos con
menos de `MIN_COMPRADORES_POR_PROYECTO` compradores no publican distribucion:
un grupo demasiado chico deja de ser un agregado y se vuelve reidentificable.

SIN SCRAPING: ciudad, zona y rango comercial se transcriben del brochure que
entrego la organizacion. No se consulta ninguna fuente externa ni se raspa
ningun portal inmobiliario.

TRAMPA #2: `estrato` no entra en `perfilComprador`, ni siquiera como atributo
descriptivo, para que nadie lo lea como variable del score mas adelante.

Uso:
    python analysis/scripts/04_build_project_profiles.py
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Mapping, Sequence

import pandas as pd

from common import (
    MIN_COMPRADORES_POR_PROYECTO,
    PERFILES_CALCULADOS,
    RAW_DIR,
    es_vis,
)

#: Catalogo manual de proyectos (ciudad, zona, nombre comercial).
CATALOGO_PROYECTOS: Path = RAW_DIR / "catalogo_proyectos.json"

#: Atributos cuya distribucion se publica en `perfilComprador`. Lista cerrada:
#: agregar un atributo es una decision de privacidad, no un detalle.
ATRIBUTOS_PERFIL: tuple[str, ...] = (
    "segmento",
    "rangoSalarial",
    "segmentoFamiliar",
    "personasACargo",
    "medioConocimiento",
)


def cargar_catalogo(ruta: Path = CATALOGO_PROYECTOS) -> Mapping[str, Mapping[str, str]]:
    """Lee el catalogo manual: proyectoId -> {nombre, ciudad, zona}.

    Vive fuera del Excel porque el Excel no trae ciudad ni zona de forma
    confiable, y porque inferir la ciudad del nombre del proyecto es la clase de
    magia que despues nadie puede explicar.
    """
    raise NotImplementedError


def normalizar_id_proyecto(nombre_proyecto: str) -> str:
    """Convierte el nombre comercial en un `proyectoId` estable (slug ASCII).

    Estable = el mismo proyecto produce el mismo id entre corridas, porque el
    backend guarda `proyectoTopId` en los leads.
    """
    raise NotImplementedError


def inferir_zona(proyecto_id: str, catalogo: Mapping[str, Mapping[str, str]]) -> str:
    """Devuelve `norte` | `sur` | `centro` | `otra` desde el catalogo manual.

    Cae en `otra` si el catalogo no lo dice. Nunca adivina desde el nombre.
    """
    raise NotImplementedError


def calcular_rango_precios(df_proyecto: pd.DataFrame) -> tuple[int, int]:
    """Precio minimo y maximo observados, en pesos enteros ya normalizados.

    Usa percentiles 5 y 95 en vez de min/max crudos para que una unidad atipica
    (penthouse, local) no ensanche el rango que se le muestra al lead.
    """
    raise NotImplementedError


def calcular_proporcion_afiliados(df_proyecto: pd.DataFrame) -> float:
    """Proporcion de compradores afiliados del proyecto (insumo de la 90/10).

    Es el dato que permite al dashboard alertar cuando un proyecto se acerca al
    limite de ventas a no afiliados.
    """
    raise NotImplementedError


def construir_perfil_comprador(df_proyecto: pd.DataFrame) -> dict[str, dict[str, float]]:
    """Distribucion por atributo: atributo -> valor -> proporcion (suma 1.0).

    Se calcula solo sobre compras VIGENTES (target = 1): el buyer persona que
    interesa es el del comprador que se quedo, no el del que desistio.
    """
    raise NotImplementedError


def construir_project_profiles(
    df: pd.DataFrame,
    catalogo: Mapping[str, Mapping[str, str]],
    minimo_compradores: int = MIN_COMPRADORES_POR_PROYECTO,
) -> list[dict[str, object]]:
    """Arma la lista de payloads que valida contra `ProjectProfile[]`.

    Marca `esVIS` con `es_vis` sobre el precio desde, y omite los proyectos que
    no alcanzan `minimo_compradores`, reportando cuales se omitieron.
    """
    raise NotImplementedError


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada CLI. Devuelve 0 si la etapa termino limpia."""
    raise NotImplementedError


def _construir_parser() -> argparse.ArgumentParser:
    """Define `--catalogo`, `--minimo-compradores` y `--output`."""
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
