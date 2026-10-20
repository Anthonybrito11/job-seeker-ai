# Pruebas y desarrollo en Windows

Trabajo realizado el 18 de octubre de 2026 sobre `security/dependency-audit`.
Se conservan las versiones y correcciones de la auditoría de dependencias.
No se hizo commit ni push.

## Preparación ligera

Requisitos: Node >=22.12, npm y un ejecutable de Chromium, Chrome o Edge.
Se validó con Node 24.18.0 y npm 11.16.0 en Windows.

```powershell
npm ci
npm run test:setup
npm test
npm run docs:build
```

`test:setup` usa el Playwright ya instalado por el proyecto para obtener solo
FFmpeg y la utilidad Winldd. Se descargaron aproximadamente 1,4 MiB y los archivos
instalados ocupan unos 3,6 MiB en la caché de Playwright. No se descargó otro
navegador, no se instalaron herramientas en el PATH ni se cambió configuración
global del sistema. La preparación es explícita: `npm test` no instala runtimes.

El arnés busca, por orden, `JOB_SEEKER_TEST_BROWSER`, Chromium de Playwright,
Chrome y Edge en sus ubicaciones habituales de Windows. Si falta un ejecutable,
falla con instrucciones en lugar de descargar un navegador automáticamente.
Un ejecutable instalado no implica usar su perfil personal: las pruebas siempre
crean otro perfil vacío en un directorio temporal.

```powershell
# Opcional, para una instalación en una ruta distinta:
$env:JOB_SEEKER_TEST_BROWSER = '<ruta-al-ejecutable-de-Chromium>'
npm run test:browser
npm run test:security
```

## Diagnóstico de los 60 fallos anteriores

Había problemas de distinta naturaleza, no 60 errores independientes de Windows:

- Ruta antigua `scripts/browser.js`; el wrapper vigente vive en
  `.agents/skills/browser-automation/scripts/browser.js`.
- Pruebas que esperaban configuración personal no versionada en `.playwright`.
- `mktemp`, `sleep`, redirecciones y trabajos de shell con `&` / `wait`.
- Dependencia de Python y del puerto fijo 8799 para servir fixtures.
- Acceso a example.com/org/net/edu en lugar de páginas locales.
- Limpieza mediante `kill-all` global y borrado de estado en el perfil del repo.
- Expectativas de una API retirada: attach/detach, ref-count, who, selectores de
  sesión en el wrapper y trabajo paralelo sobre pestañas compartidas.
- Alias del CLI obsoletos para almacenamiento, trazas y herramientas de depuración.

La referencia vigente
`.agents/skills/browser-automation/references/parallel-agents.md` especifica que
no existe ref-count y que el acceso a pestañas debe ser secuencial. Se adaptaron
los grupos 05, 06 y 08 a ese contrato, conservando cobertura de sesiones, estado,
aislamiento y trabajo sobre varias pestañas. Los comandos retirados se comprueban
como no soportados. Los casos de paralelismo se sustituyeron por acceso ordenado
y batches, no por una implementación nueva de concurrencia.

Por tanto, los resultados actuales no significan que hayan reaparecido las
funciones antiguas de ref-count o que las mismas 60 aserciones sean ahora verdes.
No se usaron skips o exclusiones permanentes para esconder esos contratos antiguos.

## Aislamiento del arnés

- `tests/global-setup.mjs` crea una raíz temporal propia con espacios en su nombre,
  inicia un servidor HTTP de Node en proceso separado y espera su mensaje de
  disponibilidad. El sistema asigna un puerto libre en `127.0.0.1`.
- Cada archivo de pruebas tiene workspace, `.playwright`, perfil, registro de
  daemons y archivos de salida independientes, dentro de esa raíz temporal.
- `PWTEST_DAEMON_SESSION_DIR` evita consultar registros y sockets reales. Se
  descartan variables heredadas de Playwright que podrían indicar CDP, extensiones,
  sesiones existentes o almacenamiento de autenticación.
- La configuración permite únicamente el origen local, bloquea service workers
  y añade interceptación de peticiones antes de usar cada página.
- Un proxy local que nunca reenvía tráfico rechaza URLs externas y túneles CONNECT.
  También cubre tráfico de arranque del navegador que no pasa por las rutas de
  las páginas. Se prioriza Chrome sobre Edge si no hay Chromium de Playwright.
- Los sockets CONNECT admiten cancelaciones del cliente sin terminar el servidor.
  Una prueba cancela 20 túneles locales y comprueba que el fixture sigue disponible.
  El cierre del entorno también admite un servidor ya terminado y conserva sus
  diagnósticos de error para evitar fallos en cadena sin explicación.
- La prueba de estado comprueba dominios de cookies y orígenes de almacenamiento
  sintético. No imprime valores de cookies ni usa credenciales reales.
- Los nombres, enlaces y empresas del fixture de contactos son datos de prueba;
  sus enlaces a LinkedIn se inspeccionan como texto, nunca se navegan.
- La limpieza cierra únicamente daemons de su registro temporal y elimina la
  raíz creada por esta ejecución. No enumera ni elimina perfiles personales.
- Se mantiene `fileParallelism: false` para limitar consumo y evitar carreras.
  Las pruebas de aislamiento abren como máximo dos navegadores temporales a la vez.

## Ajustes mínimos del código compartido

1. El resolvedor del CLI también busca desde la ubicación del helper. Así el
   wrapper encuentra la dependencia local incluso si se ejecuta desde un
   workspace temporal sin node_modules.
2. Se restauró `ensure`, requerido por los scripts existentes, como verificación
   de salud. Se corrigieron save/load para llamar a `state-save` / `state-load`
   con el nombre de archivo como argumento. No se restauraron APIs de concurrencia.
3. Los helpers open/goto + eval utilizan `process.execPath`, argumentos separados
   y `execFileSync`. Esto conserva comillas, Unicode y JavaScript multilínea en
   Windows. Admiten `cwd` / `env` explícitos para pruebas; el workspace por defecto
   coincide con el del wrapper. Las APIs exportadas se mantienen.
4. Se escaparon los marcadores `<your-username>` en los textos de tres enlaces de
   `docs/guide/gold-rules.md`. Vue los interpretaba como etiquetas HTML sin cerrar.
   No se desactivó validación de enlaces ni se cambió VitePress para compilar.

## Resultados

Resultado final: **102 pruebas pasan, 0 fallan y 0 se omiten**, en 12 archivos.
La ejecución completa tardó 236,17 segundos, aproximadamente cuatro minutos.

| Grupo | Pruebas que pasan | Fallos |
|---|---:|---:|
| Sintaxis y configuración | 9 | 0 |
| Errores sin sesión | 12 | 0 |
| Ciclo de vida | 6 | 0 |
| Pestañas | 9 | 0 |
| Sesiones y perfiles aislados | 10 | 0 |
| Trabajo ordenado entre pestañas | 3 | 0 |
| Estado, depuración, trazas y vídeo | 15 | 0 |
| Contrato de seguridad de sesiones | 11 | 0 |
| Contactos y compatibilidad de argumentos | 15 | 0 |
| Servidor local y proxy de rechazo | 4 | 0 |
| Compatibilidad del CLI y correo en memoria | 8 | 0 |
| **Total** | **102** | **0** |

`npm run docs:build` termina con código 0; la última compilación tardó 10,86 s.
`npm run test:setup`, la comprobación de sintaxis y `git diff --check` también
terminan correctamente. Se verificó que las dependencias de package.json siguen
coincidiendo con el lockfile auditado y que las exportaciones públicas del módulo
browser-helpers se conservan. No quedaron raíces temporales de pruebas al finalizar.

El comando de la última ejecución completa fue:

```powershell
npm test -- --reporter=verbose --reporter=json --outputFile=.tmp-windows-verified-results.json
```

Los argumentos solo agregan reportes; no seleccionan ni excluyen pruebas.
El reporte JSON y el log `.tmp-windows-verified.log` son archivos locales ignorados
por Git. La suite también se ejecutó por grupos para diagnosticar los fallos.

La línea base anterior tenía 60 fallos preexistentes y cinco pruebas empíricas
sin ejecutar. Durante esta estabilización se detectaron y corrigieron además
problemas del arnés nuevo: cookies iniciales de Edge ajenas al fixture y cierre
prematuro del proxy al cancelar conexiones CONNECT. El proxy local, la selección
de navegador, el manejo de errores de sockets y la prueba de cancelaciones
resuelven esos problemas. La ejecución final no conserva fallos pendientes.

Se ejecutan pruebas reales de ciclo de vida, pestañas, almacenamiento sintético,
trazas, vídeo, extracción del fixture, argumentos con caracteres especiales,
aislamiento de registros y rechazo de tráfico externo. Se conservan las ocho
pruebas de compatibilidad y correo en memoria de la auditoría anterior.

## Archivos de esta etapa

- `tests/browser/helpers.mjs` y los nueve archivos `tests/browser/*.test.mjs`.
- Nuevos: `tests/global-setup.mjs`, `tests/fixtures/server.cjs`,
  `tests/fixtures/local-only.cjs`, `tests/environment/fixtures.test.mjs`.
- `vitest.config.mjs`: preparación y cierre del entorno temporal.
- `tests/security/cli-compatibility.test.mjs`: desactiva el notificador del CLI
  durante su comprobación de ayuda, para evitar consultas de actualización.
- `.agents/skills/browser-automation/scripts/browser.js` y `helper.js`.
- `lib/browser-helpers.js`.
- `package.json`: añade únicamente `test:setup` en esta etapa; no cambia versiones.
- `docs/guide/gold-rules.md`, `README.md`, `SECURITY-AUDIT.md` y este informe.

`package-lock.json`, Nodemailer y las demás correcciones de dependencias permanecen
como estaban al terminar la auditoría anterior.

## Límites y pendientes

- Las tres vulnerabilidades de desarrollo de VitePress/Vite/esbuild y la revisión
  pendiente del instalador de esbuild siguen documentadas en SECURITY-AUDIT.md.
  Esta etapa no cambia dependencias ni usa audit fix.
- No se validaron cuentas, SMTP real, postulaciones, servicios externos ni una
  conexión PostgreSQL. Esas operaciones están fuera de estas pruebas locales.
- No se promete soporte de paralelismo o ref-count: el wrapper vigente los
  descarta explícitamente. El resumen de AGENTS.md aún contiene referencias a
  ese modelo antiguo; conviene armonizarlo en una revisión de instrucciones.
- Los helpers genéricos que aceptan comandos de shell en otros flujos no se
  reescribieron; se corrigieron las funciones de navegación/evaluación ejercitadas
  por esta suite. No equivale a una auditoría de todos los scripts de producción.
- La validación de esta etapa es en Windows; otros sistemas pueden usar el mismo
  arnés proporcionando un ejecutable compatible, pero no se probaron aquí.
