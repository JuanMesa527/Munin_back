/**
 * Carga y valida la configuracion del proceso. Capa: infrastructure.
 * Es el UNICO lugar que lee `process.env`; el resto del backend recibe un
 * `AppEnv` inmutable, asi que ningun modulo puede inventarse una variable.
 *
 * OWASP A05 (mala configuracion de seguridad): la app FALLA AL ARRANCAR si en
 * produccion queda el secreto de ejemplo, si el secreto es corto o si CORS trae
 * un comodin. Preferimos no arrancar antes que arrancar insegura.
 */

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Valor placeholder de `.env.example`. Esta aqui como LISTA NEGRA, no como
 * secreto: si alguien despliega sin cambiarlo, el arranque falla.
 */
const SECRETO_DE_EJEMPLO = 'cambiame-en-local-y-nunca-lo-comitees';

/** 32 chars es el minimo razonable para un secreto de sesion de 256 bits en hex. */
const LARGO_MINIMO_SECRETO = 32;

/** Marcador de "nadie configuro la version del aviso de privacidad". */
const VERSION_POLITICA_SIN_CONFIGURAR = 'sin-configurar';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Lista separada por coma. Se parsea a `string[]` fuera del schema. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  LLM_PROVIDER: z.enum(['stub', 'anthropic', 'deepseek']).default('stub'),
  ANTHROPIC_API_KEY: z.string().trim().default(''),
  LLM_MODEL: z.string().trim().min(1).default('claude-sonnet-5'),
  DEEPSEEK_API_KEY: z.string().trim().default(''),
  // Verificado contra la API real (2026-07-25): "deepseek-chat" responde
  // invalid_request_error para esta cuenta, exige deepseek-v4-pro/-flash.
  // "flash" es el default: rapido y barato, apropiado para extraer un slot.
  DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-v4-flash'),

  CLOSER_SESSION_SECRET: z.string().min(1, 'falta el secreto de sesion del closer'),
  CLOSER_SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(480),

  PERSISTENCE_DRIVER: z.enum(['memory', 'supabase']).default('memory'),

  /**
   * Credenciales de Supabase. Vacias por defecto porque el driver `memory` no
   * las necesita; se exigen (abajo) solo cuando `PERSISTENCE_DRIVER=supabase`.
   * `SUPABASE_SERVICE_ROLE_KEY` IGNORA RLS: vive solo aqui, jamas en el front.
   */
  SUPABASE_URL: z.string().trim().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().default(''),

  WEIGHTS_PATH: z.string().trim().min(1).default('./data/weights.json'),
  PROJECT_PROFILES_PATH: z.string().trim().min(1).default('./data/project_profiles.json'),
  PROJECTS_CATALOG_PATH: z.string().trim().min(1).default('./data/projects_catalog.json'),

  PRIVACY_POLICY_VERSION: z.string().trim().min(1).default(VERSION_POLITICA_SIN_CONFIGURAR),
});

export type LogLevel = z.infer<typeof EnvSchema>['LOG_LEVEL'];
export type LlmProvider = z.infer<typeof EnvSchema>['LLM_PROVIDER'];
export type PersistenceDriver = z.infer<typeof EnvSchema>['PERSISTENCE_DRIVER'];

export interface AppEnv {
  readonly nodeEnv: 'development' | 'test' | 'production';
  /** Atajo usado por el borde HTTP (cookies `secure`, mensajes de error). */
  readonly isProduction: boolean;
  readonly port: number;
  readonly logLevel: LogLevel;
  /** Allowlist explicita de CORS. Nunca contiene `*` en produccion. */
  readonly corsOrigins: readonly string[];
  readonly llmProvider: LlmProvider;
  /** `null` cuando no hay llave: el provider `stub` no la necesita. */
  readonly anthropicApiKey: string | null;
  readonly llmModel: string;
  /** `null` cuando no hay llave: solo lo exige `LLM_PROVIDER=deepseek` (D11). */
  readonly deepseekApiKey: string | null;
  readonly deepseekModel: string;
  readonly closerSessionSecret: string;
  readonly closerSessionTtlMinutes: number;
  readonly persistenceDriver: PersistenceDriver;
  /** URL del proyecto Supabase. `null` con el driver `memory` (solo lo exige `supabase`, D10). */
  readonly supabaseUrl: string | null;
  /** Service role key de Supabase. `null` con el driver `memory`. Nunca se loguea. */
  readonly supabaseServiceRoleKey: string | null;
  readonly weightsPath: string;
  readonly projectProfilesPath: string;
  /** Fichas comerciales de los proyectos que consume F2.1 (adenda A8). */
  readonly projectsCatalogPath: string;
  /** Version del aviso que acepta el titular. Queda en `ConsentRecord`. */
  readonly privacyPolicyVersion: string;
}

function parseOrigins(valor: string): readonly string[] {
  return valor
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);
}

/**
 * Reglas que solo aplican en produccion. Se validan aparte del schema porque
 * cruzan varios campos y porque los mensajes tienen que ser accionables a las
 * 3 de la manana.
 */
function problemasDeProduccion(env: AppEnv): string[] {
  const problemas: string[] = [];

  if (env.closerSessionSecret === SECRETO_DE_EJEMPLO) {
    problemas.push('CLOSER_SESSION_SECRET sigue siendo el valor de ejemplo de .env.example');
  }
  if (env.closerSessionSecret.length < LARGO_MINIMO_SECRETO) {
    problemas.push(
      `CLOSER_SESSION_SECRET debe tener al menos ${String(LARGO_MINIMO_SECRETO)} caracteres`,
    );
  }
  if (env.corsOrigins.includes('*')) {
    problemas.push('CORS_ORIGINS no puede contener "*": la allowlist debe ser explicita');
  }
  if (env.corsOrigins.length === 0) {
    problemas.push('CORS_ORIGINS no puede quedar vacio en produccion');
  }
  if (env.privacyPolicyVersion === VERSION_POLITICA_SIN_CONFIGURAR) {
    problemas.push(
      'PRIVACY_POLICY_VERSION debe apuntar a la version publicada del aviso (Ley 1581: consentimiento informado)',
    );
  }

  return problemas;
}

/**
 * Valida `process.env` y devuelve la configuracion tipada.
 *
 * Nunca imprime VALORES de variables, solo nombres: un mensaje de error con el
 * secreto adentro termina en el log de CI y de ahi en cualquier parte.
 */
export function loadEnv(): AppEnv {
  // `dotenv` solo rellena lo que falta: las variables reales del entorno ganan,
  // que es lo que queremos en un contenedor.
  loadDotenv({ quiet: true });

  const parseado = EnvSchema.safeParse(process.env);
  if (!parseado.success) {
    const detalle = parseado.error.issues
      .map((issue) => `  - ${issue.path.map(String).join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuracion invalida. Revisa .env.example:\n${detalle}`);
  }

  const raw = parseado.data;
  const env: AppEnv = {
    nodeEnv: raw.NODE_ENV,
    isProduction: raw.NODE_ENV === 'production',
    port: raw.PORT,
    logLevel: raw.LOG_LEVEL,
    corsOrigins: parseOrigins(raw.CORS_ORIGINS),
    llmProvider: raw.LLM_PROVIDER,
    anthropicApiKey: raw.ANTHROPIC_API_KEY.length > 0 ? raw.ANTHROPIC_API_KEY : null,
    llmModel: raw.LLM_MODEL,
    deepseekApiKey: raw.DEEPSEEK_API_KEY.length > 0 ? raw.DEEPSEEK_API_KEY : null,
    deepseekModel: raw.DEEPSEEK_MODEL,
    closerSessionSecret: raw.CLOSER_SESSION_SECRET,
    closerSessionTtlMinutes: raw.CLOSER_SESSION_TTL_MINUTES,
    persistenceDriver: raw.PERSISTENCE_DRIVER,
    supabaseUrl: raw.SUPABASE_URL.length > 0 ? raw.SUPABASE_URL : null,
    supabaseServiceRoleKey:
      raw.SUPABASE_SERVICE_ROLE_KEY.length > 0 ? raw.SUPABASE_SERVICE_ROLE_KEY : null,
    weightsPath: raw.WEIGHTS_PATH,
    projectProfilesPath: raw.PROJECT_PROFILES_PATH,
    projectsCatalogPath: raw.PROJECTS_CATALOG_PATH,
    privacyPolicyVersion: raw.PRIVACY_POLICY_VERSION,
  };

  // El provider `anthropic` sin llave arrancaria y fallaria en el primer turno
  // de conversacion: mejor no arrancar (A05, fallar temprano y visible).
  if (env.llmProvider === 'anthropic' && env.anthropicApiKey === null) {
    throw new Error('Configuracion invalida: LLM_PROVIDER=anthropic exige ANTHROPIC_API_KEY');
  }

  // Mismo fail-early que `anthropic` (D11): sin llave, `deepseek` fallaria en
  // el primer turno de conversacion, no en el arranque.
  if (env.llmProvider === 'deepseek' && env.deepseekApiKey === null) {
    throw new Error('Configuracion invalida: LLM_PROVIDER=deepseek exige DEEPSEEK_API_KEY');
  }

  // `supabase` sin URL o sin service_role key fallaria en el primer `/consent`
  // (D10): preferimos no arrancar a arrancar con un repositorio roto.
  if (
    env.persistenceDriver === 'supabase' &&
    (env.supabaseUrl === null || env.supabaseServiceRoleKey === null)
  ) {
    throw new Error(
      'Configuracion invalida: PERSISTENCE_DRIVER=supabase exige SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  if (env.isProduction) {
    const problemas = problemasDeProduccion(env);
    if (problemas.length > 0) {
      throw new Error(
        `Configuracion invalida para produccion:\n${problemas.map((p) => `  - ${p}`).join('\n')}`,
      );
    }
  }

  return env;
}
