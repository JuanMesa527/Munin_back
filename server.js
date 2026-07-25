/**
 * ENTRYPOINT QUE DESCUBRE VERCEL. No es el entrypoint de la app.
 *
 * El preset de Node.js de Vercel busca su entrypoint POR NOMBRE: `app.*`,
 * `index.*`, `server.*`, en la raiz y bajo `src/`. Antes el match era
 * `src/app.ts` (el composition root, hoy `src/composition-root.ts`): Vercel lo
 * compilaba por su cuenta, sin aplicar `tsc-alias`, y el proceso moria con
 * ERR_INVALID_MODULE_SPECIFIER sobre `@contracts`. Tener este archivo no basto
 * para ganarle: por eso ademas el composition root ya no se llama `app.ts`.
 *
 * Corolario: ningun archivo de `src/` puede llamarse `app`, `index` ni `server`
 * mientras el proyecto viva en este preset. Si aparece uno, Vercel lo ejecuta
 * en lugar de este.
 *
 * `dist/main.js` ya hace justo lo que el preset necesita: valida la
 * configuracion y escucha en `process.env.PORT`, que es la variable que inyecta
 * la plataforma. Este archivo solo le pone un nombre que Vercel encuentra
 * primero. NO agregues logica aqui: si algo tiene que pasar al arrancar, va en
 * `src/main.ts`, que es el entrypoint real y el que se usa en local y en docker.
 */

import './dist/main.js';
