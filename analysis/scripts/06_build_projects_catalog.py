"""Etapa 6 - construye la ficha comercial de cada proyecto (`ProjectCard[]`).

Entrada : la transcripcion de los brochures publicos que vive en este archivo
          (`BROCHURES`), mas el listado de proyectos y enlaces del sheet de la
          organizacion.
Salida  : data/projects_catalog.json

## Por que esta etapa existe aparte de la 04

`04_build_project_profiles.py` produce `ProjectProfile`: el buyer persona real
derivado de los 4.142 compradores. Eso es lo que decide **a quien** se le
muestra un proyecto.

Esta etapa produce `ProjectCard`: lo que el usuario **ve** de ese proyecto
(render, area, tipologias, amenidades, precio). Son datos de naturaleza
distinta y de fuente distinta -- uno sale del Excel, el otro del brochure --
asi que se generan y se versionan por separado. Un cambio de brochure no debe
obligar a recalibrar el scoring.

## Fuente y trazabilidad

Todo lo de `BROCHURES` esta transcrito a mano de los PDFs publicos enlazados
en el sheet del reto (heyzine.com/flip-book/...), campo `brochureUrl` de cada
proyecto. SIN SCRAPING de portales inmobiliarios ni de ninguna otra fuente.

Los renders (`imagen`) se extrajeron de esos mismos PDFs y viven en el repo
del frontend bajo `public/proyectos/`.

## Precio: por que casi todo es un estimado

De los 17 proyectos, **solo Vibo Once publica precio** en su brochure
(150 y 175 SMLV segun tipologia). Los otros 16 dicen explicitamente que el
valor "se fija segun area, ubicacion, disponibilidad y politica comercial" y
que el definitivo es el de la promesa de compraventa.

Por eso NO inventamos precios de mercado. La banda se deriva de lo unico
verificable y publico que existe: **el tope legal de la Vivienda de Interes
Social**. Ley 2079 de 2021 y sus decretos fijan el tope en 135 SMMLV, que sube
a 150 SMMLV en las aglomeraciones urbanas definidas -- Bogota y su area de
influencia, donde caen Soacha, Chia y Tocancipa; no caen Girardot, Ricaurte ni
Ubate.

    proyecto VIS     -> hasta = tope de su municipio
                        desde = FACTOR_PISO_VIS x tope
    proyecto NO VIS   -> desde = FACTOR_PISO_NO_VIS x tope, sin techo

`FACTOR_PISO_VIS` es el unico supuesto de la etapa y esta aislado a proposito
en una constante: es lo primero que hay que reemplazar cuando el Excel de
compradores entregue el valor de vivienda real por proyecto (columna que SI
existe en el dataset del reto). Mientras tanto cada ficha viaja con
`precio.esEstimado = true` y `precio.metodo`, y la UI esta obligada a rotular
el numero como estimado.

REGLA DEL RETO: no prometemos precio ni subsidio. Un estimado rotulado como
estimado es defendible; un estimado que se lee como oferta comercial no lo es.

Uso:
    python analysis/scripts/06_build_projects_catalog.py
    python analysis/scripts/06_build_projects_catalog.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import unicodedata
from pathlib import Path
from typing import Any, Final, Sequence

# ---------------------------------------------------------------------------
# Constantes de negocio
# ---------------------------------------------------------------------------

#: Debe coincidir con `SMMLV_2026` de src/shared/contracts.ts. Si alli cambia,
#: cambia aqui y se regenera el artefacto: el contrato manda.
SMMLV: Final[int] = 1_623_500

#: Tope VIS en SMMLV. 150 en la aglomeracion urbana de Bogota, 135 en el resto
#: del pais (Ley 2079 de 2021 y decretos reglamentarios).
TOPE_VIS_AGLOMERACION: Final[int] = 150
TOPE_VIS_GENERAL: Final[int] = 135

#: Municipios dentro de la aglomeracion urbana de Bogota para efectos del tope.
AGLOMERACION_BOGOTA: Final[frozenset[str]] = frozenset(
    {"Bogota", "Soacha", "Chia", "Tocancipa"}
)

#: Techo de la banda VIS como fraccion del tope, segun el area del proyecto: el
#: apartamento VIS mas grande del catalogo se ubica en el tope y el mas chico en
#: `TECHO_VIS_MIN_AREA`. Diferenciar por area es lo unico que podemos hacer con
#: datos publicados: el area SI la trae cada brochure, el precio no.
TECHO_VIS_MIN_AREA: Final[float] = 0.82
TECHO_VIS_MAX_AREA: Final[float] = 1.00

#: Ancho de la banda dentro de un mismo proyecto (`desde` vs `hasta`).
ANCHO_BANDA: Final[float] = 0.88

#: Un proyecto NO VIS empieza, por definicion, arriba del tope VIS. Se escala
#: por area con el mismo criterio, tomando el NO VIS mas chico como piso.
FACTOR_PISO_NO_VIS: Final[float] = 1.05

#: Version del artefacto. Subir cuando cambie la forma o la transcripcion.
VERSION: Final[str] = "1.0.0"

#: Fecha de corte de la transcripcion de los brochures.
GENERADO_EN: Final[str] = "2026-07-25T00:00:00.000Z"

REPO_ROOT: Final[Path] = Path(__file__).resolve().parent.parent.parent
SALIDA: Final[Path] = REPO_ROOT / "data" / "projects_catalog.json"


# ---------------------------------------------------------------------------
# Transcripcion de los brochures publicos
# ---------------------------------------------------------------------------
#
# Campos: los que no publica el brochure van en `None`. Preferimos un hueco
# explicito a un numero inventado -- la ficha la va a leer un jurado que puede
# abrir el mismo PDF.

BROCHURES: Final[tuple[dict[str, Any], ...]] = (
    {
        "nombre": "Versalles",
        "ubicacion": "Ciudadela Colsubsidio Maipore",
        "ciudad": "Soacha",
        "zona": "sur",
        "esVIS": True,
        "descripcion": (
            "Acceso a colegios, mercados y droguerias, cerca del futuro portal de "
            "Transmilenio. Amplias zonas verdes y recreativas."
        ),
        "unidades": 560,
        "torres": 4,
        "pisos": "10 pisos con ascensor",
        "certificacionEdge": True,
        "entrega": None,
        "salaDeVentas": "Calle 30 Sur # 2-201, Soacha (autopista sur, frente a Alfagres)",
        "tipologias": [
            {
                "nombre": "Tipo unico",
                "areaConstruida": 51.41,
                "areaPrivada": 46.31,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Salon social",
            "Terraza BBQ",
            "Cancha multiple",
            "Zona de mascotas",
            "Zona de juegos infantiles",
            "Ecogym",
            "Zonas verdes",
        ],
        "lugaresCercanos": [
            "Colegio Colsubsidio",
            "Universidad Uniminuto",
            "Universidad de Cundinamarca",
            "CC Ventura Terreros",
            "CC Gran Plaza",
            "Bloc Colsubsidio La Casona",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/be784b0d5c.html",
        "imagen": "versalles",
    },
    {
        "nombre": "Pamplona",
        "ubicacion": "Ciudadela Colsubsidio Maipore",
        "ciudad": "Soacha",
        "zona": "sur",
        "esVIS": True,
        "descripcion": (
            "Dentro de la Ciudadela Maipore, con certificacion Edge y desarrollado "
            "en armonia con el medio ambiente."
        ),
        "unidades": 488,
        "torres": 12,
        "pisos": "6, 8 y 13 pisos",
        "certificacionEdge": True,
        "entrega": None,
        "salaDeVentas": "Calle 30 Sur # 2-201, Soacha (autopista sur, frente a Alfagres)",
        "tipologias": [
            {
                "nombre": "Tipo unico",
                "areaConstruida": 49.95,
                "areaPrivada": 45.55,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Lobby y administracion",
            "Zona BBQ",
            "Zonas verdes",
            "Parque biosaludable",
            "Teatrino al aire libre",
            "Cancha multiple",
            "Sala de juntas",
            "Gimnasio",
            "Zona de mascotas",
            "Zona de juegos infantiles",
        ],
        "lugaresCercanos": [
            "Futuro Portal de Transmilenio El Vinculo",
            "Polideportivo Lagos de Malibu",
            "Parque Publico de Nemesis",
            "Parroquia San Jose de Soacha",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/c159d5d733.html",
        "imagen": "pamplona",
    },
    {
        "nombre": "Zarzal",
        "ubicacion": "Ciudadela Colsubsidio Maipore",
        "ciudad": "Soacha",
        "zona": "sur",
        "esVIS": True,
        "descripcion": (
            "El proyecto VIS mas nuevo de la Ciudadela Maipore, donde miles de "
            "familias ya encontraron su espacio para vivir."
        ),
        "unidades": 504,
        "torres": 21,
        "pisos": "6 pisos",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Calle 30 Sur # 2-201, Soacha (autopista sur, frente a Alfagres)",
        "tipologias": [
            {
                "nombre": "Tipo 1",
                "areaConstruida": 43.30,
                "areaPrivada": 38.51,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            },
            {
                "nombre": "Tipo 2",
                "areaConstruida": 39.06,
                "areaPrivada": 36.89,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            },
        ],
        "amenidades": [
            "Bicicleteros",
            "Parque infantil",
            "Senderos peatonales",
            "Terraza BBQ",
            "Parque biosaludable",
            "Salon social",
            "Lobby",
        ],
        "lugaresCercanos": ["Ciudadela Colsubsidio Maipore", "Autopista Sur"],
        "brochureUrl": "https://heyzine.com/flip-book/56764c1e33.html",
        "imagen": "zarzal",
    },
    {
        "nombre": "La Macarena",
        "ubicacion": "Ciudadela Colsubsidio Maipore",
        "ciudad": "Soacha",
        "zona": "sur",
        "esVIS": True,
        "descripcion": (
            "Espacio coliving con disenos que marcan tendencia, creado para "
            "fomentar la convivencia y el bienestar personal."
        ),
        "unidades": 702,
        "torres": None,
        "pisos": "hasta 10 pisos, 2 ascensores por torre",
        "certificacionEdge": True,
        "entrega": "2025",
        "salaDeVentas": "Calle 30 Sur # 2-201, Soacha (autopista sur, frente a Alfagres)",
        "tipologias": [
            {
                "nombre": "Tipo unico",
                "areaConstruida": 34.94,
                "areaPrivada": 31.33,
                "habitaciones": 1,
                "banos": 1,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Social living y coworking",
            "Gimnasio",
            "Lavanderia comunal",
            "Juegos infantiles",
            "Cancha multiple",
            "Parque de mascotas",
            "Salon social con terraza",
            "Zonas verdes y senderos peatonales",
            "Salon de juegos",
        ],
        "lugaresCercanos": ["Ciudadela Colsubsidio Maipore"],
        "brochureUrl": "https://heyzine.com/flip-book/b168b2f5ba.html",
        "imagen": "la-macarena",
    },
    {
        "nombre": "Mongui",
        "ubicacion": "Ciudadela Colsubsidio Maipore",
        "ciudad": "Soacha",
        "zona": "sur",
        "esVIS": True,
        "descripcion": (
            "Rodeado de naturaleza en zona de alta valorizacion, cerca del futuro "
            "portal de Transmilenio, con colegios y mercados a la mano."
        ),
        "unidades": 860,
        "torres": None,
        "pisos": "hasta 10 pisos con ascensor",
        "certificacionEdge": True,
        "entrega": None,
        "salaDeVentas": "Calle 30 Sur # 2-201, Soacha (autopista sur, frente a Alfagres)",
        "tipologias": [
            {
                "nombre": "Tipo unico",
                "areaConstruida": 45.76,
                "areaPrivada": 40.55,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Parqueaderos comunales",
            "Senderos peatonales",
            "Zona de mascotas",
            "Zonas verdes",
            "Bicicleteros",
            "Zona de yoga",
            "Ecogym",
            "Salon social con terraza",
            "Zona de juegos infantiles",
        ],
        "lugaresCercanos": [
            "Futuro portal de Transmilenio",
            "Ciudadela Colsubsidio Maipore",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/866af8f6a6.html",
        "imagen": "mongui",
    },
    {
        "nombre": "Bosque de Arrayan",
        "ubicacion": "Tocancipa",
        "ciudad": "Tocancipa",
        "zona": "norte",
        "esVIS": True,
        "descripcion": (
            "Creado en armonia con el verde de la Sabana, con certificacion Edge "
            "por su diseno sostenible."
        ),
        "unidades": 528,
        "torres": 11,
        "pisos": "6 pisos con ascensor",
        "certificacionEdge": True,
        "entrega": "2026",
        "salaDeVentas": "Kilometro 22 autopista central, via La Caro-Tocancipa",
        "tipologias": [
            {
                "nombre": "Tipo D",
                "areaConstruida": 48.05,
                "areaPrivada": 43.53,
                "habitaciones": 3,
                "banos": 2,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Social living y coworking",
            "Gimnasio",
            "Salon para ninos",
            "Salon de juegos",
            "Parque biosaludable",
            "Parque de mascotas",
            "Cancha multiple",
            "Bicicleteros",
            "Zona BBQ",
            "Lavanderia comunal",
            "Zonas verdes y senderos peatonales",
        ],
        "lugaresCercanos": ["Autopista central norte", "FEMSA Coca-Cola"],
        "brochureUrl": "https://heyzine.com/flip-book/7f3c85cf46.html",
        "imagen": "bosque-de-arrayn",
    },
    {
        "nombre": "Bosque de Turpial",
        "ubicacion": "Tocancipa",
        "ciudad": "Tocancipa",
        "zona": "norte",
        "esVIS": True,
        "descripcion": (
            "Estilo de vida comodo y accesible, con certificacion EDGE y foco en "
            "sostenibilidad y eficiencia."
        ),
        "unidades": 432,
        "torres": 9,
        "pisos": "6 pisos con ascensor",
        "certificacionEdge": True,
        "entrega": None,
        "salaDeVentas": "Calle 2 n.o 9F-32, Tocancipa",
        "tipologias": [
            {
                "nombre": "Tipo unico",
                "areaConstruida": 47.00,
                "areaPrivada": 42.86,
                "habitaciones": 3,
                "banos": 2,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Parque infantil",
            "Zona de juegos infantiles",
            "Zona BBQ",
            "Bicicleteros",
            "Parqueaderos comunales",
            "Zonas verdes y sendero de trote",
            "Estaciones biosaludables",
            "Cancha multiple",
            "Zona de mascotas",
            "Social living y coworking",
            "Salon de juegos",
            "Salon para ninos",
            "Gimnasio",
        ],
        "lugaresCercanos": ["Autopista central norte", "Tocancipa centro"],
        "brochureUrl": "https://heyzine.com/flip-book/5eec0a2afc.html",
        "imagen": "bosque-de-turpial",
    },
    {
        "nombre": "Inari",
        "ubicacion": "Barrio 20 de Julio",
        "ciudad": "Chia",
        "zona": "norte",
        "esVIS": True,
        "descripcion": (
            "En un sector de gran desarrollo urbanistico, a pocas cuadras del "
            "parque principal de Chia y de la Universidad de La Sabana."
        ),
        "unidades": 594,
        "torres": 6,
        "pisos": "11 pisos",
        "certificacionEdge": True,
        "entrega": "2024",
        "salaDeVentas": "Calle 12 n.o 2-81, barrio 20 de Julio, Chia",
        "tipologias": [
            {
                "nombre": "Tipo A",
                "areaConstruida": 44.70,
                "areaPrivada": 40.08,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            },
            {
                "nombre": "Tipo C",
                "areaConstruida": 35.79,
                "areaPrivada": 31.77,
                "habitaciones": 1,
                "banos": 1,
                "precioSMMLV": None,
            },
        ],
        "amenidades": [
            "Porteria con lobby",
            "Coworking",
            "Zona de cafe",
            "Juegos infantiles",
            "Parque biosaludable",
            "Zona pet",
            "Gimnasio",
            "Salon de juegos",
            "Sala de TV",
            "Salon de reuniones",
        ],
        "lugaresCercanos": [
            "Universidad de La Sabana",
            "Universidad de Cundinamarca",
            "Hospital San Antonio",
            "Clinica de Marly",
            "Centro Comercial Centro Chia",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/8b6615372f.html",
        "imagen": "inari",
    },
    {
        "nombre": "Reserva de Guayacan",
        "ubicacion": "Girardot",
        "ciudad": "Girardot",
        "zona": "otra",
        "esVIS": True,
        "descripcion": (
            "Zona de alta valorizacion cerca del Estadio de Girardot y a cinco "
            "minutos de la Universidad de Cundinamarca."
        ),
        "unidades": 436,
        "torres": 4,
        "pisos": "con ascensor, 10 apartamentos por piso",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Kilometro 125 via Bogota-Girardot, junto al Hotel Bosques",
        "tipologias": [
            {
                "nombre": "Tipo A",
                "areaConstruida": 52.98,
                "areaPrivada": 46.98,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            },
            {
                "nombre": "Tipo C",
                "areaConstruida": 53.87,
                "areaPrivada": 47.37,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            },
        ],
        "amenidades": [
            "Porteria con recepcion",
            "Salon social",
            "Piscina para adultos",
            "Piscina para ninos",
            "Zona BBQ",
            "Parque infantil",
            "Zonas de banos y vestieres",
        ],
        "lugaresCercanos": [
            "Estadio de Girardot",
            "Universidad de Cundinamarca",
            "Uniminuto",
            "Olimpica Avenida Narino",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/aa430852c2.html",
        "imagen": "reserva-de-aguayacn",
    },
    {
        "nombre": "Saman",
        "ubicacion": "Ricaurte",
        "ciudad": "Ricaurte",
        "zona": "otra",
        "esVIS": True,
        "descripcion": (
            "Senderos ecologicos alrededor de un reservorio, con una ronda de "
            "proteccion ambiental de unos 9.000 metros cuadrados."
        ),
        "unidades": 280,
        "torres": 2,
        "pisos": "10 pisos con ascensor, 14 apartamentos por piso",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Calle 7 n.o 16-108, Ricaurte",
        "tipologias": [
            {
                "nombre": "Tipo A",
                "areaConstruida": 52.53,
                "areaPrivada": 44.19,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Parqueadero comunal 1:1",
            "Salon social",
            "Piscina para ninos y adultos",
            "Juegos infantiles",
            "Zona BBQ",
            "Gimnasio",
            "Senderos peatonales",
        ],
        "lugaresCercanos": ["Reservorio y ronda ambiental", "Via Bogota-Girardot"],
        "brochureUrl": "https://heyzine.com/flip-book/1daa8c80c5.html",
        "imagen": "samn",
    },
    {
        "nombre": "Payande",
        "ubicacion": "Ricaurte",
        "ciudad": "Ricaurte",
        "zona": "otra",
        # El brochure de Payande NO trae el sello VIS que si traen los demas, ni
        # en su PDF propio ni en el multiproyecto. Se marca NO VIS en vez de
        # asumirlo: el sello es justamente lo que define el tope de precio.
        "esVIS": False,
        "descripcion": (
            "Clima calido cerca de Bogota, en una zona con alto potencial de "
            "crecimiento comercial y turistico. Tambien pensado para inversion."
        ),
        "unidades": 320,
        "torres": 6,
        "pisos": "10 pisos, un ascensor por torre",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Kilometro 125 via Bogota-Girardot, junto al Hotel Bosques",
        "tipologias": [
            {
                "nombre": "Tipo 2",
                "areaConstruida": 44.00,
                "areaPrivada": 38.89,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            },
            {
                "nombre": "Tipo 3",
                "areaConstruida": 56.86,
                "areaPrivada": 47.01,
                "habitaciones": 3,
                "banos": 1,
                "precioSMMLV": None,
            },
        ],
        "amenidades": [
            "Piscina para ninos y adultos",
            "Salon social",
            "Salon de juegos",
            "Zonas verdes",
            "Senderos peatonales",
            "Parqueadero comunal 1:1",
        ],
        "lugaresCercanos": ["Via Bogota-Girardot", "Hotel Bosques de Colsubsidio"],
        "brochureUrl": "https://heyzine.com/flip-book/34ac4d8a9e.html",
        "imagen": "payand",
    },
    {
        "nombre": "Vibo Once",
        "ubicacion": "Centro",
        "ciudad": "Bogota",
        "zona": "centro",
        "esVIS": True,
        "descripcion": (
            "Frente a la estacion Once del Metro, en una de las zonas de mayor "
            "transformacion urbana de Bogota. Incluye 7 locales comerciales y "
            "plazoleta publica sobre la Avenida Caracas."
        ),
        "unidades": 310,
        "torres": 2,
        "pisos": "20 pisos",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Carrera 14 n.o 3-58, Bogota",
        "tipologias": [
            # Unico proyecto del catalogo con precio publicado en el brochure.
            {
                "nombre": "Tipo A",
                "areaConstruida": 50.44,
                "areaPrivada": 43.12,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": 175,
            },
            {
                "nombre": "Tipo B2",
                "areaConstruida": 42.03,
                "areaPrivada": 36.74,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": 150,
            },
        ],
        "amenidades": [
            "Porteria con lobby",
            "Coworking",
            "Gimnasio",
            "Zonas verdes",
            "Lavanderia comunal",
            "Terraza con BBQ",
            "Salon de juegos",
            "Parque infantil",
            "Bicicleteros",
            "Parqueaderos comunales",
        ],
        "lugaresCercanos": [
            "Estacion Once del Metro",
            "Estacion Bicentenario",
            "Centro de Bogota",
            "San Victorino",
            "Plaza Espana",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/d3d1f61d6b.html",
        "imagen": "vibo-once",
    },
    {
        "nombre": "Karakali",
        "ubicacion": "Chapinero",
        "ciudad": "Bogota",
        "zona": "centro",
        "esVIS": True,
        "descripcion": (
            "Diseno coliving cerca del corazon de Bogota, con amplias zonas "
            "sociales y ubicacion estrategica entre universidades."
        ),
        "unidades": 127,
        "torres": 1,
        "pisos": "16 pisos",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Carrera 15 n.o 63A-22, Bogota",
        "tipologias": [
            {
                "nombre": "Apartaestudio tipo 1",
                "areaConstruida": 28.97,
                "areaPrivada": 23.71,
                "habitaciones": 1,
                "banos": 1,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Coworking",
            "Gimnasio",
            "Zonas verdes",
            "Lavanderia comunal",
            "Terraza con BBQ",
            "Parque biosaludable",
            "Sala de juntas",
            "Parqueaderos comunales",
            "Salon de juegos",
        ],
        "lugaresCercanos": [
            "Fundacion Universitaria Los Libertadores",
            "Fundacion Universitaria Konrad Lorenz",
            "Politecnico Grancolombiano",
            "INCAP sede Chapinero",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/5083a3d46c.html",
        "imagen": "karakali",
    },
    {
        "nombre": "Araucaria",
        "ubicacion": "Ciudadela Colsubsidio Calle 80",
        "ciudad": "Bogota",
        "zona": "norte",
        "esVIS": False,
        "descripcion": (
            "En la Ciudadela Calle 80, una ciudad dentro de la ciudad. Acabados "
            "de alta calidad, parqueadero privado y deposito."
        ),
        "unidades": 252,
        "torres": 4,
        "pisos": "7 pisos con ascensor",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Ciudadela Colsubsidio Calle 80, Bogota",
        "tipologias": [
            {
                "nombre": "Tipo C",
                "areaConstruida": 74.36,
                "areaPrivada": 68.06,
                "habitaciones": 3,
                "banos": 2,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Terraza con BBQ",
            "Coworking",
            "Gimnasio",
            "Salon social",
            "Zonas verdes",
            "Pista de trote",
            "Salon de juegos",
        ],
        "lugaresCercanos": ["Ciudadela Colsubsidio Calle 80", "Avenida Calle 80"],
        "brochureUrl": "https://heyzine.com/flip-book/26d2b013cf.html",
        "imagen": "araucaria",
    },
    {
        "nombre": "Los Nogales",
        "ubicacion": "Ciudadela Colsubsidio Calle 80",
        "ciudad": "Bogota",
        "zona": "norte",
        "esVIS": False,
        "descripcion": (
            "Proyecto arquitectonico emblematico de Bogota dentro de la Ciudadela "
            "Calle 80. Todos los apartamentos con tres habitaciones."
        ),
        "unidades": 168,
        "torres": 3,
        "pisos": "7 pisos con ascensor",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Ciudadela Colsubsidio Calle 80, Bogota",
        "tipologias": [
            {
                "nombre": "Tipo A",
                "areaConstruida": 77.95,
                "areaPrivada": 67.08,
                "habitaciones": 3,
                "banos": 2,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Porteria con lobby",
            "Terraza con BBQ",
            "Coworking",
            "Gimnasio",
            "Parque infantil",
            "Zonas verdes",
        ],
        "lugaresCercanos": [
            "Ciudadela Colsubsidio Calle 80",
            "CC Unicentro de Occidente",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/9dd9bf814e.html",
        "imagen": "los-nogales",
    },
    {
        "nombre": "Verde Esperanza",
        "ubicacion": "Villa de San Diego de Ubate",
        "ciudad": "Ubate",
        "zona": "norte",
        "esVIS": True,
        "descripcion": (
            "Rodeado de entorno natural y amplios espacios verdes, a pocas cuadras "
            "del parque principal de Ubate. Se entrega en obra gris."
        ),
        "unidades": 440,
        "torres": 22,
        "pisos": "5 pisos",
        "certificacionEdge": False,
        "entrega": None,
        "salaDeVentas": "Carrera 7 # 8-12, Ubate",
        "tipologias": [
            {
                "nombre": "Tipo A",
                "areaConstruida": 49.53,
                "areaPrivada": 46.13,
                "habitaciones": 2,
                "banos": 1,
                "precioSMMLV": None,
            }
        ],
        "amenidades": [
            "Zonas verdes",
            "Parque infantil",
            "Edificio comunal",
            "Parque biosaludable",
            "Senderos peatonales",
            "Zona de juegos infantiles",
        ],
        "lugaresCercanos": [
            "Universidad de Cundinamarca",
            "Hospital El Salvador de Ubate",
            "Parque Ricaurte",
            "Basilica Menor Divino Salvador",
        ],
        "brochureUrl": "https://heyzine.com/flip-book/ea1997d7ae.html",
        "imagen": "verde-esperanza",
    },
)


# ---------------------------------------------------------------------------
# Derivaciones
# ---------------------------------------------------------------------------


def slug(texto: str) -> str:
    """`Bosque de Arrayan` -> `bosque-de-arrayan`. Sin tildes ni simbolos."""
    plano = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return "-".join(plano.lower().split())


def tope_vis_smmlv(ciudad: str) -> int:
    """Tope VIS del municipio, en SMMLV."""
    return (
        TOPE_VIS_AGLOMERACION
        if ciudad in AGLOMERACION_BOGOTA
        else TOPE_VIS_GENERAL
    )


def posicion_por_area(area: float, minima: float, maxima: float) -> float:
    """Ubica un area en 0..1 dentro del rango de areas de su grupo."""
    if maxima <= minima:
        return 1.0
    return (area - minima) / (maxima - minima)


def banda_precio(
    proyecto: dict[str, Any], rango_vis: tuple[float, float]
) -> dict[str, Any]:
    """Banda de precio de la ficha, en pesos enteros.

    Si el brochure publica precio, se usa ese y `esEstimado` queda en `False`.
    Si no, se deriva del tope VIS del municipio escalado por el area publicada
    del proyecto (ver cabecera del modulo).
    """
    publicados = [
        t["precioSMMLV"] for t in proyecto["tipologias"] if t["precioSMMLV"] is not None
    ]
    if publicados:
        return {
            "desde": round(min(publicados) * SMMLV),
            "hasta": round(max(publicados) * SMMLV),
            "esEstimado": False,
            "metodo": "Precio publicado por el constructor en el brochure del proyecto.",
        }

    tope = tope_vis_smmlv(proyecto["ciudad"])
    area = max(t["areaConstruida"] for t in proyecto["tipologias"])
    posicion = posicion_por_area(area, *rango_vis)

    if proyecto["esVIS"]:
        factor = TECHO_VIS_MIN_AREA + posicion * (TECHO_VIS_MAX_AREA - TECHO_VIS_MIN_AREA)
        techo = factor * tope
        return {
            "desde": round(ANCHO_BANDA * techo * SMMLV),
            "hasta": round(techo * SMMLV),
            "esEstimado": True,
            "metodo": (
                f"Estimado desde el tope VIS de {tope} SMMLV vigente en "
                f"{proyecto['ciudad']}, escalado por el area publicada del "
                f"proyecto ({area:.2f} m2). El brochure no publica precio."
            ),
        }

    # Un NO VIS arranca arriba del tope; el area lo separa de sus pares.
    piso = FACTOR_PISO_NO_VIS * tope * (1 + posicion * 0.25)
    return {
        "desde": round(piso * SMMLV),
        "hasta": None,
        "esEstimado": True,
        "metodo": (
            f"Estimado: el proyecto no es VIS, asi que arranca por encima del tope "
            f"de {tope} SMMLV. Escalado por su area publicada ({area:.2f} m2). "
            "El brochure no publica precio."
        ),
    }


def construir_ficha(
    proyecto: dict[str, Any], rango_areas: tuple[float, float]
) -> dict[str, Any]:
    """Arma un `ProjectCard` a partir de la transcripcion del brochure."""
    tipologias = proyecto["tipologias"]
    areas = [t["areaConstruida"] for t in tipologias]

    return {
        "proyectoId": slug(proyecto["nombre"]),
        "nombre": proyecto["nombre"],
        "ubicacion": proyecto["ubicacion"],
        "ciudad": proyecto["ciudad"],
        "zona": proyecto["zona"],
        "esVIS": proyecto["esVIS"],
        "descripcion": proyecto["descripcion"],
        "unidades": proyecto["unidades"],
        "torres": proyecto["torres"],
        "pisos": proyecto["pisos"],
        "areaDesde": min(areas),
        "areaHasta": max(areas) if len(areas) > 1 else None,
        "habitacionesDesde": min(t["habitaciones"] for t in tipologias),
        "habitacionesHasta": max(t["habitaciones"] for t in tipologias),
        "tipologias": tipologias,
        "amenidades": proyecto["amenidades"],
        "lugaresCercanos": proyecto["lugaresCercanos"],
        "entrega": proyecto["entrega"],
        "certificacionEdge": proyecto["certificacionEdge"],
        "salaDeVentas": proyecto["salaDeVentas"],
        "brochureUrl": proyecto["brochureUrl"],
        # Ruta servida por el frontend desde `public/`. El nombre del archivo es
        # el `proyectoId`, no el slug del PDF de origen.
        "imagen": f"/proyectos/{slug(proyecto['nombre'])}.webp",
        "precio": banda_precio(proyecto, rango_areas),
    }


def rango_areas_de(proyectos: Sequence[dict[str, Any]]) -> tuple[float, float]:
    """Area construida minima y maxima del grupo, para escalar el precio."""
    areas = [max(t["areaConstruida"] for t in p["tipologias"]) for p in proyectos]
    return (min(areas), max(areas))


def construir_catalogo() -> dict[str, Any]:
    """Arma el archivo completo, con su envoltura de metadatos."""
    # VIS y NO VIS se escalan contra su propio grupo: un NO VIS de 78 m2 no
    # puede arrastrar la escala de los VIS, que viven todos entre 29 y 53 m2.
    rangos = {
        True: rango_areas_de([p for p in BROCHURES if p["esVIS"]]),
        False: rango_areas_de([p for p in BROCHURES if not p["esVIS"]]),
    }

    fichas = [construir_ficha(p, rangos[p["esVIS"]]) for p in BROCHURES]
    estimados = sum(1 for f in fichas if f["precio"]["esEstimado"])

    return {
        "version": VERSION,
        "generadoEn": GENERADO_EN,
        "fuente": (
            "Brochures publicos de Colsubsidio enlazados en el sheet del reto "
            "(heyzine.com). Transcritos a mano; sin scraping."
        ),
        "_aviso": (
            f"{estimados} de {len(fichas)} proyectos traen precio ESTIMADO desde el "
            "tope VIS porque su brochure no publica precio. La UI esta obligada a "
            "rotularlos como estimados. Reemplazar con el valor de vivienda real "
            "por proyecto cuando corra el pipeline sobre el Excel de compradores."
        ),
        "proyectos": fichas,
    }


def validar(catalogo: dict[str, Any]) -> None:
    """Guardarrailes de forma. Cortan la exportacion, no avisan y siguen."""
    fichas = catalogo["proyectos"]

    ids = [f["proyectoId"] for f in fichas]
    if len(ids) != len(set(ids)):
        raise ValueError(f"proyectoId duplicado en el catalogo: {ids}")

    for ficha in fichas:
        precio = ficha["precio"]
        if precio["hasta"] is not None and precio["hasta"] < precio["desde"]:
            raise ValueError(f"{ficha['proyectoId']}: banda de precio invertida")
        # Los montos cruzan el contrato en pesos enteros (trampa de datos #1):
        # nadie aguas abajo puede reescalar.
        if not isinstance(precio["desde"], int):
            raise ValueError(f"{ficha['proyectoId']}: precio.desde no es entero")
        if not ficha["tipologias"]:
            raise ValueError(f"{ficha['proyectoId']}: sin tipologias")


def main(argv: Sequence[str] | None = None) -> int:
    args = _construir_parser().parse_args(argv)

    catalogo = construir_catalogo()
    validar(catalogo)

    estimados = sum(1 for f in catalogo["proyectos"] if f["precio"]["esEstimado"])
    print(f"{len(catalogo['proyectos'])} proyectos · {estimados} con precio estimado")

    if args.dry_run:
        print("dry-run: no se escribio nada")
        return 0

    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(
        json.dumps(catalogo, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    print(f"escrito -> {args.salida}")
    return 0


def _construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="valida y no escribe")
    parser.add_argument("--salida", type=Path, default=SALIDA)
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
