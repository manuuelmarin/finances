# Desarrollo y herramientas

Finanzas 3.8.1 combina una PWA estática y Google Apps Script privado. La API conserva la versión 3.3.0 y el libro utiliza el modelo 3. El entorno operativo sigue siendo `ENVIRONMENT=test`; el mantenimiento del repositorio no activa el principal ni modifica una instalación privada de Google.

## Mapa del repositorio

| Ruta                          | Responsabilidad                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `web/`                        | Interfaz, cliente de API, canal de conexión, cola, gráficos, cálculos y recursos de la PWA. |
| `apps-script/Code.gs`         | Backend, autorización, lectura, operaciones, revisión, journal y cotizaciones.              |
| `apps-script/Bridge.html`     | Puente de la sesión privada de Google hacia la app.                                         |
| `apps-script/appsscript.json` | Manifiesto y permisos del proyecto de Google.                                               |
| `apps-script/PRICES.md`       | Fuentes de NAV verificadas, límites históricos y rutina voluntaria de pruebas.              |
| `tools/`                      | Generadores, servidor local, comprobaciones y adaptadores de agentes.                       |
| `tests/*.test.cjs`            | Pruebas con `node:test` y servicios simulados.                                              |
| `tests/browser/`              | Pruebas Playwright de escritorio y móvil con datos ficticios.                               |
| `.github/workflows/`          | Comprobaciones de calidad y publicación de `web/` en Pages.                                 |

Consulta [Arquitectura](ARCHITECTURE.md), [Contribuir](../CONTRIBUTING.md) y [Seguridad](../SECURITY.md) para los contratos, el flujo de revisión y la privacidad.

## Preparar y ejecutar

Instala Node.js 24 o superior; CI utiliza Node 24. Desde la raíz:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
```

CI instala Chromium con dependencias de sistema en Ubuntu. En un entorno con esas dependencias ya disponibles puedes usar `npx playwright install chromium`. No se necesitan credenciales ni acceso a Sheets para los tests.

Para servir la app en local:

```sh
npm run build
node tools/serve.cjs
```

Abre `http://127.0.0.1:4173`. El servidor solo sirve `web/`; no autentica una sesión de Google ni crea un backend local. La instalación privada continúa en el [instalador](https://manuuelmarin.github.io/finances/install.html). Playwright inicia este servidor automáticamente y prueba perfiles Desktop Chrome y Pixel 7. Los tests bloquean service workers salvo en la prueba específica de PWA, que verifica el caché público y la reapertura sin conexión. Estos perfiles no sustituyen la comprobación de instalación en un teléfono físico.

## Comandos de calidad

| Comando                | Efecto                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build`        | Ejecuta, en orden, `build-install.cjs`, `build-security.cjs` y `build-sw.cjs`.                                                 |
| `npm run format`       | Aplica Prettier a los archivos no excluidos.                                                                                   |
| `npm run format:check` | Comprueba el formato sin escribir cambios.                                                                                     |
| `npm run lint`         | Ejecuta ESLint, incluyendo `.js`, `.cjs` y `.gs`.                                                                              |
| `npm test`             | Ejecuta `tools/test.cjs`, las suites `tests/*.test.cjs` y guarda el informe TAP.                                               |
| `npm run test:browser` | Ejecuta Playwright y genera resultados e informe HTML.                                                                         |
| `npm run audit`        | Ejecuta `npm audit --audit-level=high`; falla ante vulnerabilidades conocidas altas o críticas.                                |
| `npm run check`        | Ejecuta build, comprobación de formato, lint, tests de Node y tests de navegador. No incluye audit ni comprobación de commits. |

Prettier utiliza comillas simples y trata `.gs` con parser Babel. También formatea HTML, CSS, JSON, Markdown y YAML. `.prettierignore` excluye dependencias, resultados, lockfile e instalador/service worker generados. No hay código Python ni una etapa de Black.

Los resultados locales se escriben en `quality-results/`, `test-results/` y `playwright-report/`. `tools/quality-summary.cjs` resume los resultados en GitHub Actions; CI conserva los informes durante 14 días. Usa siempre datos ficticios, también en capturas y trazas.

El workflow comprueba dependencias, commits nuevos, build, formato, lint y ambas suites. El job de Pages depende de calidad y solo publica desde `main` en eventos que no sean PR. No instala ni actualiza Apps Script.

## Fuentes y archivos generados

`tools/build-install.cjs` incorpora los tres archivos de Apps Script al instalador y verifica las versiones de entrega. `tools/build-security.cjs` genera la CSP de `web/index.html`, `web/install.html` y `web/preview.html`; `tools/build-sw.cjs` calcula la versión de caché a partir de los recursos públicos.

Edita los archivos fuente y ejecuta `npm run build`. No edites a mano los bloques de `web/install.html`, el contenido de `web/sw.js` ni las huellas CSP generadas. Revisa el diff después de regenerar. Cambiar documentación no requiere incrementar la versión de la app, de la API ni del modelo.

## Herramientas para agentes

`tools/agent-envelope.cjs` y `tools/agent-queue.cjs` son módulos CommonJS, no comandos que abran una sesión o reciban credenciales. Requieren un cliente privado de `FinanceApiClient` con transporte autenticado de Google. No existe un endpoint HTTP público de escritura ni un mecanismo para omitir el inicio de sesión. No incluyas credenciales, URLs privadas ni IDs reales en argumentos de terminal, ejemplos, commits o reportes.

Empieza con `client.read()` y revisa el estado y la revisión del libro. Para consultar una operación ya enviada, usa `client.requestStatus(envelope)` con el sobre conservado y su mismo `requestId` UUID. La consulta del journal permite averiguar si el servidor la confirmó; una respuesta incierta no autoriza crear otra operación.

`prepare(snapshot, operations)` genera un sobre `transact` desde una lectura API 3.3.0 con revisión y vínculo de libro. Admite entre 1 y 20 operaciones; la API genera los IDs definitivos de los registros. Preparar un sobre no lo envía. `submit(client, envelope, { persist })` exige persistirlo antes de enviar y consulta el recibo si falla la respuesta.

La cola persistente comparte el motor de `web/queue.js`. Este ejemplo supone que las operaciones ya se han revisado y su envío está autorizado:

```js
const { openQueue } = require('./tools/agent-queue.cjs');
const queue = await openQueue({
  directory: privateStateDirectory,
  deploymentUrl,
});
await queue.saveSnapshot(await client.read());
await queue.enqueue(operations, 'Operación revisada');
await queue.run(client);
```

Guarda el estado fuera del repositorio. La cola conserva lectura, libro, sobre, UUID y estado antes del envío; separa implementaciones y bloquea un cambio de libro. Utiliza permisos de usuario, bloqueo exclusivo, escritura atómica y sincronización a disco. Estos archivos contienen información financiera y no están cifrados por la herramienta.

Después de un cierre, abre la misma cola y llama `run(client)` sin preparar ni encolar otra vez la operación. El motor consulta los recibos de solicitudes inciertas y conserva los conflictos para revisión. Un conflicto exige una lectura nueva y revisión explícita; no cambies silenciosamente un sobre enviado. Un archivo corrupto o un bloqueo ocupado impide reemplazar la cola. Si queda un `.lock` después de un cierre, conserva los archivos y retíralo solo después de comprobar que ningún proceso lo está usando.

Usa los procesos de `financialApi` para altas, correcciones y anulaciones. Consultar transacciones o un UUID en el journal no requiere escribir celdas, insertar movimientos temporales ni modificar credenciales. Las herramientas no autorizan escrituras directas a Sheets ni activación de producción. Conserva el XLSX de origen y los documentos privados de coordinación hasta el corte expresamente aceptado.

## Cotizaciones y verificación privada

Una consulta correcta puede devolver `ok:true` y seguir incompleta: revisa `complete` y los resultados individuales. Conserva el último NAV si una fuente falla. Cada precio requiere identidad, clase, divisa y fecha efectiva verificables; no reconstruyas históricos diarios con valores actuales o muestras interpoladas. Consulta [PRICES.md](../apps-script/PRICES.md) antes de modificar fuentes o la rutina diaria.

`comprobarCierre()` y **Comprobar sistema** comprueban estructura, cálculos, canal, fuentes y revisión sin escrituras. `technicalReady:true` exige todos los checks correctos, pero no acredita una instalación en teléfono, otra cuenta o una fuente vigente. Los procedimientos que preparan backend, actualizan cotizaciones o instalan triggers tienen efectos en Google y no forman parte de los tests locales. Mantén el entorno y la implementación existentes durante el mantenimiento del repositorio.
