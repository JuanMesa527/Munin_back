/**
 * Catalogo de datos calibrados leido de archivos. Capa: infrastructure
 * (adapter de `DataCatalogPort`).
 *
 * Lee la salida del pipeline offline de `analysis/` (`data/weights.json`,
 * `data/project_profiles.json`), la VALIDA con zod y la cachea en memoria. Se
 * valida aunque el archivo sea "nuestro" porque un artefacto regenerado a mano a
 * las 3 de la manana es entrada no confiable como cualquier otra: mejor un 503
 * explicable que un score calculado con basura.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { ProjectCard, ProjectProfile, ScoringWeights } from '@contracts';
import type { DataCatalogPort, ProjectCatalog } from '../../application/ports/data-catalog.port.js';
import { DataUnavailableError, NotFoundError } from '../../kernel/errors.js';
import type { Result } from '../../kernel/result.js';
import { err, ok } from '../../kernel/result.js';
import { logger } from '../logging/logger.js';

/**
 * `placeholder: true` lo escriben los archivos semilla del repo. Mientras este
 * marcado, el catalogo responde `DataUnavailableError`: preferimos que la UI diga
 * "aun no hay datos calibrados" antes que mostrar un score inventado.
 */
const ArchivoPesosSchema = z.object({
  version: z.string().min(1),
  pesos: z.record(z.string(), z.number()),
  umbralViable: z.number().min(0).max(100),
  calibracion: z.object({
    metrica: z.string().min(1),
    valor: z.number(),
    n: z.number().int().nonnegative(),
  }),
  generadoEn: z.string().min(1),
  placeholder: z.boolean().optional(),
});

const ArchivoProyectoSchema = z.object({
  proyectoId: z.string().min(1),
  nombre: z.string().min(1),
  ciudad: z.string().min(1),
  zona: z.enum(['norte', 'sur', 'centro', 'otra']),
  precioDesde: z.number().int().nonnegative(),
  precioHasta: z.number().int().nonnegative(),
  esVIS: z.boolean(),
  perfilComprador: z.record(z.string(), z.record(z.string(), z.number())),
  proporcionAfiliados: z.number().min(0).max(1),
  placeholder: z.boolean().optional(),
});

/**
 * Se aceptan las dos formas posibles del archivo (arreglo plano, o envoltura con
 * `proyectos` para poder marcar `placeholder` arriba) porque el artefacto lo
 * genera el pipeline de `analysis/` y no queremos acoplar el backend a una
 * decision de formato que todavia se puede mover.
 */
const ArchivoProyectosSchema = z.union([
  z.array(ArchivoProyectoSchema),
  z.object({
    placeholder: z.boolean().optional(),
    proyectos: z.array(ArchivoProyectoSchema),
  }),
]);

type ArchivoProyectos = z.infer<typeof ArchivoProyectosSchema>;

/**
 * Ficha comercial (adenda A8). Se valida con el mismo criterio que el resto: el
 * archivo lo genera `analysis/scripts/06_build_projects_catalog.py`, pero un
 * artefacto regenerado a mano es entrada no confiable igual que cualquier otra.
 */
const ArchivoTipologiaSchema = z.object({
  nombre: z.string().min(1),
  areaConstruida: z.number().positive(),
  areaPrivada: z.number().positive().nullable(),
  habitaciones: z.number().int().positive(),
  banos: z.number().int().positive(),
  precioSMMLV: z.number().positive().nullable(),
});

const ArchivoBandaPrecioSchema = z
  .object({
    desde: z.number().int().nonnegative(),
    hasta: z.number().int().nonnegative().nullable(),
    esEstimado: z.boolean(),
    metodo: z.string().min(1),
  })
  // Una banda invertida pintaria "$243M - $189M" en la tarjeta. Mejor 503.
  .refine((banda) => banda.hasta === null || banda.hasta >= banda.desde, {
    message: 'la banda de precio esta invertida (hasta < desde)',
  });

const ArchivoFichaSchema = z.object({
  proyectoId: z.string().min(1),
  nombre: z.string().min(1),
  ubicacion: z.string().min(1),
  ciudad: z.string().min(1),
  zona: z.enum(['norte', 'sur', 'centro', 'otra']),
  esVIS: z.boolean(),
  descripcion: z.string().min(1),
  unidades: z.number().int().positive().nullable(),
  torres: z.number().int().positive().nullable(),
  pisos: z.string().min(1).nullable(),
  areaDesde: z.number().positive(),
  areaHasta: z.number().positive().nullable(),
  habitacionesDesde: z.number().int().positive(),
  habitacionesHasta: z.number().int().positive(),
  tipologias: z.array(ArchivoTipologiaSchema).min(1),
  amenidades: z.array(z.string().min(1)),
  lugaresCercanos: z.array(z.string().min(1)),
  entrega: z.string().min(1).nullable(),
  certificacionEdge: z.boolean(),
  salaDeVentas: z.string().min(1).nullable(),
  // Solo https: una URL de brochure con otro esquema es un vector de phishing
  // en un enlace que el usuario abre desde nuestra UI.
  brochureUrl: z.url().startsWith('https://'),
  imagen: z.string().startsWith('/'),
  precio: ArchivoBandaPrecioSchema,
});

const ArchivoCatalogoSchema = z.object({
  version: z.string().min(1),
  proyectos: z.array(ArchivoFichaSchema).min(1),
  placeholder: z.boolean().optional(),
});

/** Nombre logico del artefacto. Nunca exponemos la ruta real del filesystem. */
type Artefacto = 'weights' | 'project_profiles' | 'projects_catalog';

export interface FileDataCatalogDeps {
  readonly weightsPath: string;
  readonly projectProfilesPath: string;
  readonly projectsCatalogPath: string;
}

export class FileDataCatalogAdapter implements DataCatalogPort {
  /** Se cachea el EXITO, no el fallo: asi se puede regenerar el artefacto y reintentar sin reiniciar. */
  private pesosEnCache: ScoringWeights | null = null;
  private proyectosEnCache: ProjectProfile[] | null = null;
  private catalogoEnCache: ProjectCatalog | null = null;

  constructor(private readonly deps: FileDataCatalogDeps) {}

  async getWeights(): Promise<Result<ScoringWeights>> {
    if (this.pesosEnCache !== null) {
      return ok(this.pesosEnCache);
    }

    const crudo = await this.leerJson(this.deps.weightsPath, 'weights');
    if (!crudo.ok) {
      return crudo;
    }

    const parseado = ArchivoPesosSchema.safeParse(crudo.value);
    if (!parseado.success) {
      return err(this.artefactoInvalido('weights', parseado.error.issues));
    }
    if (parseado.data.placeholder === true) {
      return err(this.artefactoPlaceholder('weights'));
    }

    // TRAMPA DE DATOS #2 del reto: los porcentajes de estrato del dataset no
    // suman 100%, asi que `estrato` NO puede ser una variable del score. El
    // contrato lo prohibe y aqui se hace cumplir: si aparece, el artefacto se
    // rechaza en vez de contaminar silenciosamente la decision.
    const claveProhibida = Object.keys(parseado.data.pesos).find((clave) =>
      /estrato/iu.test(clave),
    );
    if (claveProhibida !== undefined) {
      logger.error({ artefacto: 'weights' }, 'weights.json contiene un peso de estrato');
      return err(
        new DataUnavailableError('Los pesos calibrados no son validos', {
          pesos: 'estrato no puede ser una variable del score',
        }),
      );
    }

    const pesos: ScoringWeights = {
      version: parseado.data.version,
      pesos: parseado.data.pesos,
      umbralViable: parseado.data.umbralViable,
      calibracion: parseado.data.calibracion,
      generadoEn: parseado.data.generadoEn,
    };
    this.pesosEnCache = pesos;
    return ok(pesos);
  }

  async getProjectProfiles(): Promise<Result<ProjectProfile[]>> {
    if (this.proyectosEnCache !== null) {
      return ok(this.proyectosEnCache);
    }

    const crudo = await this.leerJson(this.deps.projectProfilesPath, 'project_profiles');
    if (!crudo.ok) {
      return crudo;
    }

    const parseado = ArchivoProyectosSchema.safeParse(crudo.value);
    if (!parseado.success) {
      return err(this.artefactoInvalido('project_profiles', parseado.error.issues));
    }

    const { esPlaceholder, proyectos } = normalizarProyectos(parseado.data);
    if (esPlaceholder) {
      return err(this.artefactoPlaceholder('project_profiles'));
    }

    this.proyectosEnCache = proyectos;
    return ok(proyectos);
  }

  async getProjectProfile(proyectoId: string): Promise<Result<ProjectProfile>> {
    const todos = await this.getProjectProfiles();
    if (!todos.ok) {
      return todos;
    }

    const encontrado = todos.value.find((proyecto) => proyecto.proyectoId === proyectoId);
    if (encontrado === undefined) {
      return err(new NotFoundError('Proyecto no encontrado', { proyectoId: 'no existe' }));
    }
    return ok(encontrado);
  }

  async getProjectCatalog(): Promise<Result<ProjectCatalog>> {
    if (this.catalogoEnCache !== null) {
      return ok(this.catalogoEnCache);
    }

    const crudo = await this.leerJson(this.deps.projectsCatalogPath, 'projects_catalog');
    if (!crudo.ok) {
      return crudo;
    }

    const parseado = ArchivoCatalogoSchema.safeParse(crudo.value);
    if (!parseado.success) {
      return err(this.artefactoInvalido('projects_catalog', parseado.error.issues));
    }
    if (parseado.data.placeholder === true) {
      return err(this.artefactoPlaceholder('projects_catalog'));
    }

    const catalogo: ProjectCatalog = {
      version: parseado.data.version,
      // `ArchivoFichaSchema` reproduce `ProjectCard` campo a campo, asi que lo
      // que sale de zod ya es la forma del contrato.
      proyectos: parseado.data.proyectos,
    };
    this.catalogoEnCache = catalogo;
    return ok(catalogo);
  }

  async getProjectCard(proyectoId: string): Promise<Result<ProjectCard>> {
    const catalogo = await this.getProjectCatalog();
    if (!catalogo.ok) {
      return catalogo;
    }

    const encontrado = catalogo.value.proyectos.find(
      (proyecto) => proyecto.proyectoId === proyectoId,
    );
    if (encontrado === undefined) {
      return err(new NotFoundError('Proyecto no encontrado', { proyectoId: 'no existe' }));
    }
    return ok(encontrado);
  }

  /**
   * Lee y parsea el JSON. La ruta concreta solo va al log del servidor: un
   * mensaje de error con rutas absolutas le dibuja el disco al atacante
   * (OWASP A09 / fuga de informacion).
   */
  private async leerJson(
    ruta: string,
    artefacto: Artefacto,
  ): Promise<Result<unknown, DataUnavailableError>> {
    const rutaAbsoluta = resolve(ruta);
    try {
      const texto = await readFile(rutaAbsoluta, 'utf8');
      return ok(JSON.parse(texto) as unknown);
    } catch (error) {
      logger.error(
        { err: error, artefacto, ruta: rutaAbsoluta },
        'no se pudo leer el artefacto de datos calibrados',
      );
      return err(new DataUnavailableError('No hay datos calibrados disponibles', { artefacto }));
    }
  }

  private artefactoInvalido(
    artefacto: Artefacto,
    issues: readonly { message: string }[],
  ): DataUnavailableError {
    logger.error(
      { artefacto, problemas: issues.map((issue) => issue.message) },
      'el artefacto de datos calibrados no cumple el contrato',
    );
    return new DataUnavailableError('Los datos calibrados no son validos', { artefacto });
  }

  private artefactoPlaceholder(artefacto: Artefacto): DataUnavailableError {
    logger.warn({ artefacto }, 'el artefacto sigue marcado como placeholder');
    return new DataUnavailableError(
      'Los datos calibrados todavia son un placeholder: corre el pipeline de analysis/',
      { artefacto },
    );
  }
}

/**
 * Aplana las dos formas del archivo y descarta la bandera `placeholder` para que
 * no viaje al dominio: `ProjectProfile` del contrato no la tiene.
 */
function normalizarProyectos(datos: ArchivoProyectos): {
  esPlaceholder: boolean;
  proyectos: ProjectProfile[];
} {
  const items = Array.isArray(datos) ? datos : datos.proyectos;
  const banderaArriba = Array.isArray(datos) ? false : datos.placeholder === true;
  const esPlaceholder = banderaArriba || items.some((item) => item.placeholder === true);

  const proyectos = items.map<ProjectProfile>((item) => ({
    proyectoId: item.proyectoId,
    nombre: item.nombre,
    ciudad: item.ciudad,
    zona: item.zona,
    precioDesde: item.precioDesde,
    precioHasta: item.precioHasta,
    esVIS: item.esVIS,
    perfilComprador: item.perfilComprador,
    proporcionAfiliados: item.proporcionAfiliados,
  }));

  return { esPlaceholder, proyectos };
}
