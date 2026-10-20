# Auditoría de dependencias de Job Seeker AI

Fecha: 18 de octubre de 2026. Rama: `security/dependency-audit`.
Entorno de validación: Windows, Node 24.18.0, npm 11.16.0.

Seguimiento: los resultados de pruebas y documentación de este informe son la
línea base de la auditoría. La estabilización posterior está documentada en
[WINDOWS-TESTING.md](WINDOWS-TESTING.md), sin cambiar las decisiones de dependencias.

## Resultado

El reporte completo pasó de **10 paquetes afectados (6 altos, 4 moderados)** a
**3 (1 alto, 2 moderados)**. `npm audit --omit=dev` pasó de 1 alto a **0**.
Estos números cuentan paquetes afectados, incluyendo propagación a sus padres,
no diez avisos independientes ni diez rutas de explotación demostradas.

Git estaba limpio en `main` antes de crear la rama. No se hizo commit ni push.
Se conservaron las APIs de correo, PostgreSQL, los scripts existentes y el wrapper
de navegador. No se ejecutaron flujos de búsqueda, mensajes ni conexiones a cuentas
o bases de datos. Las pruebas nuevas utilizan datos sintéticos y correo en memoria.

## Dependencias y exposición

Las dependencias directas de producción son `nodemailer` y `pg`. Las directas de
desarrollo eran `vitest`, `vitepress`, `@types/pg` y `playwright-cli`. Este último
se sustituyó por `@playwright/cli`. Vue, PostCSS, Vite, esbuild, nanoid,
source-map-js y @vitest/mocker son transitivas de herramientas de desarrollo.
Eso reduce su exposición en producción, pero no elimina riesgos para el equipo
que desarrolla o genera documentación.

| Paquete / problema | Introducido por | Evaluación del uso real | Estado |
|---|---|---|---|
| @vitest/mocker: lectura arbitraria | vitest | Requiere la ruta de mocks y servidor susceptible; las pruebas configuradas usan forks de Node, sin browser provider ni API expuesta. No se identificó una ruta explotable en esta configuración. | Corregido |
| @vue/server-renderer: XSS | vitepress > vue | Renderiza documentación durante el build. No se identificaron nombres de atributos controlados por usuarios externos en ejecución; contenido o plugins no confiables aumentarían el riesgo. | Corregido |
| nanoid: bucle con tamaño cero | vitepress > postcss | El código de la aplicación no llama a generadores personalizados ni proporciona tamaños externos. No se identificó una ruta explotable en los scripts revisados. | Corregido |
| source-map-js: DoS | vitepress > postcss y compiladores Vue | Procesa mapas durante el build. Riesgo condicionado a mapas manipulados de contenido, paquetes o plugins; no se identificó entrada remota directa de la aplicación. | Corregido |
| nodemailer: múltiples avisos | Dependencia directa | `scripts/send-email.js` usa SMTP, destinatarios, texto/HTML y adjuntos. Direcciones manipuladas sí alcanzan el parser. No usa jsonTransport, List-*, raw, OAuth2, envelope.size ni resolveContent; esos vectores no se identificaron en el wrapper actual. Los problemas de parser y TLS justifican la actualización. | Corregido con aprobación del usuario |
| esbuild: CORS de servidor de desarrollo | vitepress > vite 5 | Vite usa transformaciones de esbuild; no se encontró una llamada de la aplicación a esbuild.serve. El aviso específico requiere ese servidor, no basta con ejecutar transform. | Pendiente en el árbol |
| Vite: traversal, UNC y bypass de fs.deny en Windows | vitepress | `docs:dev` puede exponer el servidor vulnerable. El bypass de rutas de Windows es relevante para este equipo. No se arrancó ese servidor durante la auditoría. | Pendiente |
| vitepress | Dependencia directa de desarrollo | npm propaga los problemas de su Vite transitivo. | Pendiente |

Esta es una evaluación de alcanzabilidad mediante revisión estática, no una
demostración de que toda entrada futura sea segura ni una prueba de penetración.

Los avisos de Nodemailer cubrían interpretación de dominios y comentarios,
inyecciones SMTP/cabeceras, agotamiento de CPU o pila, lecturas de archivos/SSRF
al eludir restricciones, caché DNS/TLS y validación TLS de OAuth2. La versión
instalada ya no aparece afectada en la auditoría de npm de esta fecha.

## Versiones principales del cambio

| Dependencia | Antes | Después |
|---|---|---|
| nodemailer | 6.10.1 | 10.1.6 |
| playwright-cli | 0.262.0, obsoleto | Eliminado y sustituido |
| @playwright/cli | Ausente | 0.1.22 exacta |
| vitest y @vitest/* | 4.1.10 | 4.1.12 |
| vue y @vue/* | 3.5.41 | 3.5.44 |
| nanoid | 3.3.16 | 3.3.20 |
| source-map-js | 1.2.1 | 1.2.2 |
| postcss | 8.5.25 | 8.5.30 |
| Vite de Vitest | 8.2.0 | 8.3.4 |
| rolldown y sus binarios opcionales | 1.2.1 | 1.2.14 |

También se resolvieron transitivas compatibles: @babel/parser 7.29.8 a 7.29.9,
@oxc-project/types 0.142.0 a 0.154.0, chai 6.2.2 a 6.3.0,
picomatch 4.0.5 a 4.0.7 y tinyrainbow 3.1.1 a 3.2.0.
El diff del lockfile contiene los detalles por plataforma.

Sin cambios: pg 8.23.0, @types/pg 8.20.0, vitepress 1.6.4 y su Vite 5.4.21 /
esbuild 0.21.5. `npm outdated` informa pg y @types/pg 8.23.1 y Vitest 5.0.5.
Esas actualizaciones no eran necesarias para corregir los avisos encontrados.
No quedan entradas `deprecated` en el lockfile resultante.

## Decisiones y cambios de código

- Se priorizaron actualizaciones dentro de los rangos existentes, sin overrides
  incompatibles ni `npm audit fix --force`. Se elevó el mínimo de Vitest a
  `^4.1.12` para no permitir la versión vulnerable en futuras resoluciones.
- Nodemailer 10.1.6 requiere Node >=20. Se conservan CommonJS, createTransport y
  sendMail. El proyecto declara Node >=22.12.0, alineado con Vite y con el mínimo
  22 que ya indicaba su documentación. Se verificó en Node 24.18.0.
- `send-email.js` carga `.env` al llamar a sendEmail, en lugar de al importar el
  módulo. La importación no lee credenciales ni crea transportes. La interfaz
  pública y los adjuntos por archivo se mantienen.
- El CLI nuevo conserva el binario `playwright-cli`. Se fija 0.1.22 para limitar
  cambios del protocolo interno. Su distribución depende de Playwright/core
  `1.64.0-alpha-1790635538000`; esa dependencia previa al lanzamiento es del
  paquete oficial y merece revisar futuras actualizaciones con cuidado.
- El helper prefiere el CLI local del proyecto y resuelve playwright-core con
  el algoritmo de Node, compatible con paquetes elevados a node_modules por npm.
  Esto corrige la lectura de versiones y flags sin depender de un CLI global.
- Se añadió `npm run test:security`, sin modificar el significado de los scripts
  originales. README y getting-started explican el paquete local y Node mínimo.

## esbuild y scripts de instalación

`npm approve-scripts --allow-scripts-pending` confirma únicamente
`esbuild@0.21.5` como pendiente. Se revisaron su manifest y el instalador local:
su postinstall selecciona/valida el ejecutable de la plataforma, con rutas de
respaldo para obtener el binario si faltara.

Se probó `transformSync('let x = 1')`: funciona usando el binario de Windows
instalado. La advertencia de aprobación y la vulnerabilidad CORS son problemas
distintos; aprobar el instalador no corrige el CVE.

Las actualizaciones se realizaron con `--ignore-scripts` para no ejecutar scripts
de dependencias innecesariamente. Fue una opción de esas invocaciones; la
configuración persistente `ignore-scripts` continúa en `false`. No se añadieron
aprobaciones globales, `allowScripts`, excepciones de auditoría ni desactivaciones
de seguridad. La aprobación pendiente se mantiene explícita. Si se decide
autorizarla, revisar y aprobar solo la versión instalada de esbuild, nunca usar
`npm approve-scripts --all` como solución automática.

## Verificación y límites

| Comprobación | Antes | Después |
|---|---|---|
| Suite existente, excluyendo archivo 09 | 15 pasan, 60 fallan | 15 existentes pasan, mismos 60 fallan; 8 pruebas nuevas pasan |
| Archivo 09, unidades deriveRecruiterCategory y mapResultsToContacts | 7 pasan, 5 no seleccionadas | 7 pasan, 5 no seleccionadas |
| npm run test:security | No existía | 8/8 pasan |
| npm run docs:build | Falla en gold-rules.md:46:141 | Mismo error de etiqueta sin cerrar |
| npm audit | 10: 6 altas, 4 moderadas | 3: 1 alta, 2 moderadas |
| npm audit --omit=dev | 1 alta | 0 |

Comandos de pruebas ejecutados antes y después:

```powershell
npm test -- --exclude tests/browser/09-warm-sourcing.test.mjs
npm test -- tests/browser/09-warm-sourcing.test.mjs -t 'deriveRecruiterCategory|mapResultsToContacts'
npm run docs:build
```

Se compararon los nombres de las 60 pruebas fallidas y coinciden exactamente.
Muchas esperan `scripts/browser.js`, aunque el wrapper actual está en
`.agents/skills/browser-automation/scripts/`. También hay supuestos Unix
(`mktemp`, `sleep`, comandos en paralelo) y configuración local de Playwright
que no sirven como prueba portable de este checkout en Windows.

Las cinco pruebas empíricas del archivo 09 no se ejecutaron: abren navegador
mediante el wrapper que puede usar un perfil persistente, y esta tarea excluye
acceso a cuentas/sesiones reales. No se modificaron ni ocultaron esas pruebas.
No se afirma que la suite completa esté verde ni que la automatización de
navegador esté validada de extremo a extremo.

Las pruebas nuevas verifican texto, HTML, remitente, adjuntos sintéticos,
opciones SMTP, ausencia de efectos al importar, errores de credenciales,
resolución local sin PATH, ayuda del CLI, flags dinámicos y rechazo de sesiones
sintéticas de una versión incompatible. No conectan con SMTP ni navegadores.
También se comprobaron sintaxis de los tres JS cambiados, `npm ls --all`,
consistencia de instalación con simulación de npm ci y `git diff --check`.
Los scripts de DB, connect, daemon y envío no se ejecutaron por sus efectos externos.

## Pendientes y recomendaciones

1. VitePress 1.6.4 sigue siendo la versión estable publicada. `next` es
   2.0.0-alpha.20 y depende de Vite ^8.2.1 / plugin-vue ^6.0.8. Pasar a esa
   versión requiere autorización y validar la documentación completa. Forzar
   Vite 7/8 bajo VitePress 1 saldría de sus rangos soportados. No se aplicó
   ninguna de esas migraciones sin aprobación.
2. Hasta corregir la cadena, evitar ejecutar el servidor de desarrollo de
   documentación. Publicar únicamente el resultado estático cuando su build
   vuelva a funcionar. Restringir a localhost ayuda frente a acceso de red,
   pero no garantiza protección frente a todos los vectores documentados.
3. Reparar las pruebas antiguas con fixtures HTTP locales, directorios de perfil
   temporales y operaciones portables de Node. Eliminar `kill-all` global de la
   limpieza de tests antes de usarlos con sesiones reales. Esta auditoría no
   reconstruye el arnés de navegador ni arregla el Markdown preexistente.
4. Usar `npm ci` con el lockfile revisado, revisar avisos de instalación por
   paquete y ejecutar auditoría completa y de producción periódicamente.
5. Revisar por separado scripts `npx --yes acp-connector` / `pm2`, que resuelven
   herramientas externas al lockfile en tiempo de ejecución. No se ejecutaron.
6. Antes de conectar Gmail, LinkedIn o PostgreSQL: mantener secretos fuera de Git,
   permisos mínimos y perfiles de navegador aislados. El resultado limpio de
   producción en npm audit no sustituye una auditoría de toda la aplicación.

## Archivos modificados o añadidos

- `package.json` y `package-lock.json`.
- `.agents/skills/browser-automation/scripts/helper.js` y `browser.js`.
- `scripts/send-email.js`.
- `README.md` y `docs/guide/getting-started.md`.
- `tests/security/email-compatibility.test.mjs` y `cli-compatibility.test.mjs`.
- `SECURITY-AUDIT.md`.

## Fuentes primarias consultadas

- [Vitest: lectura arbitraria por mocks](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- [Vue SSR: XSS](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6).
- [nanoid: bucle infinito](https://github.com/advisories/GHSA-2v37-7h3g-55p8).
- [source-map-js: DoS](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- [esbuild: CORS del servidor](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
- [Vite: bypass en Windows](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).
- [Historial oficial de Nodemailer](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md).
- [Paquete anterior y aviso de migración](https://www.npmjs.com/package/playwright-cli).
- Metadatos del registro npm mediante `npm view`, auditorías de npm y código
  de npm 11.16.0 instalado para revisar la política de aprobación de scripts.
