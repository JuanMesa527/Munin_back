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

  // Las reglas con tipos solo pueden correr sobre archivos que esten en un
  // tsconfig. Este propio archivo y cualquier .js/.mjs no lo estan, asi que se
  // les apagan: si no, ESLint muere al arrancar.
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        // `allowDefaultProject`: los archivos de config de la raiz no estan en
        // el `include` del tsconfig (que apunta a src/ y tests/), pero igual
        // queremos lintearlos.
        projectService: {
          allowDefaultProject: ['vitest.config.ts'],
        },
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

      // Este repo es stub-first (regla 28): los casos de uso llegan con la firma
      // completa y cuerpo `throw new Error('TODO')`, asi que sus parametros aun
      // no se usan. Prefijar con `_` es la forma de decir "esto va aqui a
      // proposito" sin apagar la regla para el codigo ya implementado.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Apagada a proposito: dispara en los helpers de envoltura y de asercion
      // (`sendOk<T>`, `readValidatedQuery<T>`), donde el generico ES el contrato
      // con quien llama aunque aparezca una sola vez en la firma.
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',

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
