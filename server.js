/**
 * ENTRYPOINT QUE DESCUBRE VERCEL. No es el entrypoint de la app.
 *
 * El preset de Node.js de Vercel busca, EN ESTE ORDEN, `app.*`, `index.*` y
 * `server.*` en la raiz, y despues los mismos nombres bajo `src/`. Sin este
 * archivo el primer match era `src/app.ts`, que es el COMPOSITION ROOT: exporta
 * `createApp` pero no levanta ningun servidor, y ademas Vercel lo compilaba por
 * su cuenta sin resolver los alias de `tsconfig.paths`. De ahi los errores de
 * `@contracts` en los logs y el FUNCTION_INVOCATION_FAILED.
 *
 * `dist/main.js` ya hace justo lo que el preset necesita: valida la
 * configuracion y escucha en `process.env.PORT`, que es la variable que inyecta
 * la plataforma. Este archivo solo le pone un nombre que Vercel encuentra
 * primero. NO agregues logica aqui: si algo tiene que pasar al arrancar, va en
 * `src/main.ts`, que es el entrypoint real y el que se usa en local y en docker.
 */

import './dist/main.js';
