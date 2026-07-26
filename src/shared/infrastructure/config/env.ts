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

  /**
   * Saltos de proxy en los que SI confiamos para leer `X-Forwarded-For`.
   * `0` (default) = no confiar en nadie. Detras de Vercel u otro PaaS con un
   * unico proxy delante, `1`. Ver el porque en `security.ts`.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

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
  CLOSER_USERNAME: z.string().trim().min(1, 'falta el usuario del closer'),
  CLOSER_PASSWORD: z.string().min(1, 'falta la contrasena del closer'),

  /**
   * Login por OTP del lead (F2.2, adenda A14). Deliberadamente MUCHO mas
   * largo que `CLOSER_SESSION_TTL_MINUTES`: un lead vuelve a nutrirse a lo
   * largo de dias/semanas, no en un turno de trabajo — 30 dias por defecto.
   */
  LEAD_SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(129_600).default(43_200),

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

  /**
   * F5 · call-simulation. `CALL_SIM_PROVIDER` es independiente de `LLM_PROVIDER`:
   * el roleplay usa un puerto propio (`CallSimulatorPort`), nunca `LlmPort`
   * (regla 12, glass-box — ver contracts.ts adenda A11).
   */
  CALL_SIM_PROVIDER: z.enum(['stub', 'deepseek']).default('stub'),
  /** `none` deja `CallTurn.audio` en `null`: la UI cae a solo texto. */
  SPEECH_PROVIDER: z.enum(['none', 'polly']).default('none'),
  AWS_REGION: z.string().trim().min(1).default('us-east-1'),
  POLLY_ENGINE: z.enum(['generative', 'neural', 'standard']).default('generative'),
  POLLY_VOICE_FEMALE: z.string().trim().min(1).default('Mia'),
  POLLY_VOICE_MALE: z.string().trim().min(1).default('Andres'),
  /**
   * Adenda A12. `none` deja el dictado apagado y el closer escribe; `aws` usa
   * Amazon Transcribe Streaming con las MISMAS credenciales que Polly.
   */
  TRANSCRIPTION_PROVIDER: z.enum(['none', 'aws']).default('none'),

  /**
   * Envio real del OTP del lead (F2.2, adenda A14). `mock` (default) loguea
   * el envio sin tocar red, igual que `LLM_PROVIDER=stub`; `smtp` manda un
   * correo real (pensado para Gmail con "contrasena de aplicacion").
   */
  EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
  SMTP_HOST: z.string().trim().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_USER: z.string().trim().default(''),
  SMTP_PASSWORD: z.string().trim().default(''),
  /** Remitente que ve el lead. Vacio por defecto: el adapter cae a `SMTP_USER`. */
  SMTP_FROM: z.string().trim().default(''),
});

export type LogLevel = z.infer<typeof EnvSchema>['LOG_LEVEL'];
export type LlmProvider = z.infer<typeof EnvSchema>['LLM_PROVIDER'];
export type PersistenceDriver = z.infer<typeof EnvSchema>['PERSISTENCE_DRIVER'];
export type CallSimProvider = z.infer<typeof EnvSchema>['CALL_SIM_PROVIDER'];
export type SpeechProvider = z.infer<typeof EnvSchema>['SPEECH_PROVIDER'];
export type PollyEngine = z.infer<typeof EnvSchema>['POLLY_ENGINE'];
export type TranscriptionProvider = z.infer<typeof EnvSchema>['TRANSCRIPTION_PROVIDER'];
export type EmailProvider = z.infer<typeof EnvSchema>['EMAIL_PROVIDER'];

export interface AppEnv {
  readonly nodeEnv: 'development' | 'test' | 'production';
  /** Atajo usado por el borde HTTP (cookies `secure`, mensajes de error). */
  readonly isProduction: boolean;
  readonly port: number;
  readonly logLevel: LogLevel;
  /** Allowlist explicita de CORS. Nunca contiene `*` en produccion. */
  readonly corsOrigins: readonly string[];
  /** Saltos de proxy confiables. `0` = no confiar en `X-Forwarded-For`. */
  readonly trustProxy: number;
  readonly llmProvider: LlmProvider;
  /** `null` cuando no hay llave: el provider `stub` no la necesita. */
  readonly anthropicApiKey: string | null;
  readonly llmModel: string;
  /** `null` cuando no hay llave: solo lo exige `LLM_PROVIDER=deepseek` (D11). */
  readonly deepseekApiKey: string | null;
  readonly deepseekModel: string;
  readonly closerSessionSecret: string;
  readonly closerSessionTtlMinutes: number;
  readonly closerUsername: string;
  readonly closerPassword: string;
  /** Login por OTP del lead (F2.2, adenda A14). */
  readonly leadSessionTtlMinutes: number;
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

  /** F5 · call-simulation. `null` cuando `deepseekApiKey` tambien lo es. */
  readonly callSimProvider: CallSimProvider;
  readonly speechProvider: SpeechProvider;
  readonly awsRegion: string;
  readonly pollyEngine: PollyEngine;
  readonly pollyVoiceFemale: string;
  readonly pollyVoiceMale: string;
  /** Dictado del closer. Comparte `awsRegion` y credenciales con Polly (A12). */
  readonly transcriptionProvider: TranscriptionProvider;

  /** Envio real del OTP del lead (F2.2, adenda A14). */
  readonly emailProvider: EmailProvider;
  readonly smtpHost: string;
  readonly smtpPort: number;
  /** `null` cuando no hay usuario configurado: solo lo exige `EMAIL_PROVIDER=smtp`. */
  readonly smtpUser: string | null;
  /** `null` cuando no hay contrasena configurada. Nunca se loguea. */
  readonly smtpPassword: string | null;
  /** `null` cuando no se configuro: el adapter cae a `smtpUser` como remitente. */
  readonly smtpFrom: string | null;
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
  if (env.closerPassword.length < 12) {
    problemas.push('CLOSER_PASSWORD debe tener al menos 12 caracteres');
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
    trustProxy: raw.TRUST_PROXY,
    llmProvider: raw.LLM_PROVIDER,
    anthropicApiKey: raw.ANTHROPIC_API_KEY.length > 0 ? raw.ANTHROPIC_API_KEY : null,
    llmModel: raw.LLM_MODEL,
    deepseekApiKey: raw.DEEPSEEK_API_KEY.length > 0 ? raw.DEEPSEEK_API_KEY : null,
    deepseekModel: raw.DEEPSEEK_MODEL,
    closerSessionSecret: raw.CLOSER_SESSION_SECRET,
    closerSessionTtlMinutes: raw.CLOSER_SESSION_TTL_MINUTES,
    closerUsername: raw.CLOSER_USERNAME,
    closerPassword: raw.CLOSER_PASSWORD,
    leadSessionTtlMinutes: raw.LEAD_SESSION_TTL_MINUTES,
    persistenceDriver: raw.PERSISTENCE_DRIVER,
    supabaseUrl: raw.SUPABASE_URL.length > 0 ? raw.SUPABASE_URL : null,
    supabaseServiceRoleKey:
      raw.SUPABASE_SERVICE_ROLE_KEY.length > 0 ? raw.SUPABASE_SERVICE_ROLE_KEY : null,
    weightsPath: raw.WEIGHTS_PATH,
    projectProfilesPath: raw.PROJECT_PROFILES_PATH,
    projectsCatalogPath: raw.PROJECTS_CATALOG_PATH,
    privacyPolicyVersion: raw.PRIVACY_POLICY_VERSION,
    callSimProvider: raw.CALL_SIM_PROVIDER,
    speechProvider: raw.SPEECH_PROVIDER,
    awsRegion: raw.AWS_REGION,
    pollyEngine: raw.POLLY_ENGINE,
    transcriptionProvider: raw.TRANSCRIPTION_PROVIDER,
    pollyVoiceFemale: raw.POLLY_VOICE_FEMALE,
    pollyVoiceMale: raw.POLLY_VOICE_MALE,
    emailProvider: raw.EMAIL_PROVIDER,
    smtpHost: raw.SMTP_HOST,
    smtpPort: raw.SMTP_PORT,
    smtpUser: raw.SMTP_USER.length > 0 ? raw.SMTP_USER : null,
    smtpPassword: raw.SMTP_PASSWORD.length > 0 ? raw.SMTP_PASSWORD : null,
    smtpFrom: raw.SMTP_FROM.length > 0 ? raw.SMTP_FROM : null,
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

  // F5 · call-simulation: mismo puerto DEEPSEEK_API_KEY que arriba (es la
  // misma cuenta/llave), pero un interruptor independiente de LLM_PROVIDER
  // porque el roleplay usa `CallSimulatorPort`, no `LlmPort` (regla 12).
  if (env.callSimProvider === 'deepseek' && env.deepseekApiKey === null) {
    throw new Error('Configuracion invalida: CALL_SIM_PROVIDER=deepseek exige DEEPSEEK_API_KEY');
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

  // `smtp` sin usuario o sin contrasena fallaria en el primer OTP real (mismo
  // fail-early que `anthropic`/`deepseek` arriba).
  if (env.emailProvider === 'smtp' && (env.smtpUser === null || env.smtpPassword === null)) {
    throw new Error('Configuracion invalida: EMAIL_PROVIDER=smtp exige SMTP_USER y SMTP_PASSWORD');
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
