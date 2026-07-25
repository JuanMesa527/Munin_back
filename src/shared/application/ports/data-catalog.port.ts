/**
 * Puerto del catalogo de datos calibrados. Capa: application (puerto compartido).
 *
 * Es la unica via por la que el codigo lee la salida del pipeline offline de
 * `analysis/` (`weights.json`, `project_profiles.json`). Los pesos NO se
 * hardcodean en el dominio: vienen versionados para que un score se pueda
 * reproducir y defender meses despues (`ScoringWeights.version`).
 */

import type { ProjectCard, ProjectProfile, ScoringWeights } from '@contracts';
import type { Result } from '../../kernel/result.js';

/** El catalogo comercial viaja con su version para que una baraja sea auditable. */
export interface ProjectCatalog {
  version: string;
  proyectos: ProjectCard[];
}

export interface DataCatalogPort {
  getWeights(): Promise<Result<ScoringWeights>>;
  getProjectProfiles(): Promise<Result<ProjectProfile[]>>;
  getProjectProfile(proyectoId: string): Promise<Result<ProjectProfile>>;
  /**
   * Fichas comerciales de `data/projects_catalog.json` (adenda A8 del contrato).
   *
   * Se lee aparte de `getProjectProfiles` a proposito: el buyer persona sale del
   * Excel de compradores y la ficha sale de los brochures. Hoy los perfiles
   * siguen en placeholder y el catalogo comercial ya es real, asi que F2.1 puede
   * mostrar proyectos aunque el scoring todavia no este calibrado.
   */
  getProjectCatalog(): Promise<Result<ProjectCatalog>>;
  getProjectCard(proyectoId: string): Promise<Result<ProjectCard>>;
}
