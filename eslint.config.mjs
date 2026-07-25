// @ts-check
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Reglas que hacen CUMPLIR el EQUIPO.md, no solo sugerirlo.
 *
 *  - `no-explicit-any` en error  -> regla 8 (tipado estricto).
 *  - `no-restricted-imports`     -> reglas 1, 2 y 4 (regla de dependencia,
 *                                   dominio puro, aislamiento de features).
 *  - `no-console`                -> usar el logger de pino con redaccion de PII.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'analysis/**'] },

  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  // ---- Regla 2: el dominio es puro. Cero frameworks, cero I/O. ----
  {
    files: ['src/**/domain/**/*.ts', 'src/shared/kernel/**/*.ts', 'src/shared/contracts.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'express',
                'helmet',
                'cors',
                'pino*',
                'zod',
                '@anthropic-ai/*',
                'node:*',
                'fs',
                'path',
                'crypto',
                '**/infrastructure/**',
                '**/interface/**',
              ],
              message:
                'DOMINIO PURO (regla 2): domain/ y kernel/ no pueden importar frameworks, I/O ni capas externas. Define un puerto en application/ y pasa el dato como argumento.',
            },
          ],
        },
      ],
    },
  },

  // ---- Regla 1: application solo depende de domain. Nada de infra. ----
  {
    files: ['src/**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'express',
                'helmet',
                'cors',
                'pino*',
                '@anthropic-ai/*',
                '**/infrastructure/**',
                '**/interface/**',
              ],
              message:
                'REGLA DE DEPENDENCIA (regla 1): application/ no puede importar infrastructure/, interface/ ni frameworks. Depende de puertos, no de implementaciones.',
            },
          ],
        },
      ],
    },
  },

  // ---- Regla 4: una feature no importa internals de otra. ----
  {
    files: ['src/features/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@features/*/domain/*', '@features/*/application/*', '@features/*/infrastructure/*', '../../*/domain/*', '../../*/application/*', '../../*/infrastructure/*'],
              message:
                'AISLAMIENTO DE FEATURES (regla 4): no importes internals de otra feature. Comunicate por @contracts o por un puerto en shared/application/ports.',
            },
          ],
        },
      ],
    },
  },

  // ---- Tests: mas laxos, pero seguimos sin `any`. ----
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  prettier,
);
