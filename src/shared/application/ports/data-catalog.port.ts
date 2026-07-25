/**
 * Puerto del catalogo de datos calibrados. Capa: application (puerto compartido).
 *
 * Es la unica via por la que el codigo lee la salida del pipeline offline de
 * `analysis/` (`weights.json`, `project_profiles.json`). Los pesos NO se
 * hardcodean en el dominio: vienen versionados para que un score se pueda
 * reproducir y defender meses despues (`ScoringWeights.version`).
 */

import type { ProjectProfile, ScoringWeights } from '@contracts';
import type { Result } from '../../kernel/result.js';

export interface DataCatalogPort {
  getWeights(): Promise<Result<ScoringWeights>>;
  getProjectProfiles(): Promise<Result<ProjectProfile[]>>;
  getProjectProfile(proyectoId: string): Promise<Result<ProjectProfile>>;
}
