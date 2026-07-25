import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Regla 10: la logica de dominio (scoring, capacidad, plan de nutricion,
 * enrutamiento) va cubierta con tests. Es determinista, asi que es facil.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/domain/**', 'src/**/application/**'],
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@contracts': fileURLToPath(new URL('./src/shared/contracts.ts', import.meta.url)),
    },
  },
});
