# Finanzas

Entrega 3.4.0. App responsive y PWA sobre el libro completo de Google Sheets, modelo 3. La API 3.3.0 admite pruebas y principal privado con configuración explícita y libros distintos. Google calcula los resultados; la app registra entradas mediante la API privada y muestra los estados por operación.

## Desarrollo y calidad

Node 24. `npm ci --ignore-scripts`, `npx playwright install --with-deps chromium`, `npm run check`. Prettier mantiene el formato; ESLint detecta errores; node:test comprueba reglas, canal, precios y recuperación; Playwright prueba ordenador y móvil con datos ficticios. Actions publica Pages únicamente tras superar calidad. Los commits nuevos siguen Conventional Commits: `feat(app): ...`, `fix(api): ...`, `ci(quality): ...`.

Actions también ejecuta `npm run audit`: vulnerabilidades conocidas altas o críticas bloquean la publicación. Las acciones se fijan por commit completo. Revisar y actualizar deliberadamente esos commits y el lockfile; una revisión sin avisos no garantiza ausencia de fallos desconocidos.

`npm run build` genera el instalador exacto desde los tres archivos de Apps Script y la versión de caché desde los recursos públicos. No editar sus bloques de código a mano. Las dependencias están fijadas en package-lock.json. Las pruebas simuladas no acreditan una implementación privada de Google ni un teléfono físico.

## Uso por agentes

1. Leer el estado por `FinanceApiClient.read()` desde la sesión privada autorizada de Google. El proyecto de pruebas conserva `TEST_SPREADSHEET_ID`, `OWNER_EMAIL` y `ENVIRONMENT=test` fuera del repositorio. El principal requiere un proyecto/implementación separados, `PRODUCTION_SPREADSHEET_ID` distinto y `ENVIRONMENT=production`. No transmitir IDs de libro, credenciales ni URLs privadas en commits.
2. Preparar operaciones con nombres del negocio o selecciones resueltas. `tools/agent-envelope.cjs` genera una referencia automática y revisión desde la lectura 3.3.0. Los IDs definitivos los genera Apps Script. El adaptador necesita un transporte autenticado; no ofrece un endpoint HTTP público ni evita el inicio de sesión.
3. Guardar el sobre completo antes de enviar. Usar `client.submit(envelope)`. Ante respuesta incierta consultar `client.requestStatus(envelope)` y reintentar exactamente el mismo sobre. Un conflicto exige nueva lectura y revisión explícita; nunca cambiar silenciosamente una solicitud ya enviada.
4. Usar altas, correcciones y anulaciones de `financialApi`; nunca escribir celdas para registrar operaciones. No borrar precios al fallar una fuente, no convertir datos desconocidos en cero y no registrar compras históricas otra vez como caja nueva.
5. El original XLSX se conserva durante pruebas. Su archivo definitivo y la elección de Sheets como única fuente operativa requieren el corte y aceptación del paso 8. Los dos documentos privados de coordinación conservan las referencias y pendientes; no se publican en este repositorio.

## Seguridad y límites de la auditoría

La autorización se comprueba en el servidor antes de acceder a Sheets, tanto en la API como en las funciones públicas del editor. Las escrituras admiten procesos y campos concretos; el cliente no puede elegir un libro o enviar instrucciones de celda. El texto se escribe con `stringValue`, no como fórmula. El HTML de terceros nunca se ejecuta en la app. Los errores internos no se devuelven al navegador. Las cotizaciones solo consultan dos rutas HTTPS fijas del proveedor, por ISIN validado y sin seguir redirecciones.

Bridge valida origen, ventana y referencia de sesión; la API acepta respuestas únicamente del marco y origen exactos del saludo autenticado. La interfaz usa `textContent` para datos del libro. La CSP bloquea scripts en línea, eval, recursos externos, formularios y objetos; los estilos de instalación/vista previa se autorizan por huella. La app incrustada no carga su copia local ni habilita configuración u operaciones; abrirla en su propia ventana. La CSP en una etiqueta meta no permite configurar `frame-ancestors` ni sustituye las cabeceras de un alojamiento con control propio.

La lectura y los pendientes de IndexedDB permiten trabajar sin conexión y no están cifrados por la app. Utilizar un dispositivo, perfil y cuenta de Google de confianza. Borrar la copia local desde Mi libro al dejar de usarlo; resolver primero los pendientes. Todos los proyectos bajo el mismo origen `manuuelmarin.github.io` comparten la frontera de confianza del navegador: no publicar código ajeno o no revisado bajo ese origen. Un dominio/origen dedicado y cabeceras HTTP completas deben valorarse si cambia esa condición.

La revisión cubre los archivos del repositorio y ataques simulados. Antes del uso real comprobar la implementación exacta instalada, acceso Solo yo y rechazo de una cuenta distinta. Ni tests ni una auditoría puntual garantizan ausencia de vulnerabilidades desconocidas o compromiso del dispositivo/cuentas. Mantener Google y GitHub protegidos, y repetir la auditoría al cambiar dependencias, código o despliegues.

## Instalación privada

[Instalador](https://manuuelmarin.github.io/finances/install.html). Copiar los tres archivos, ejecutar `comprobarPaso5`, publicar una nueva versión de Google y abrir el libro desde la app. El resultado general `ok:true` no significa que todos los precios se hayan encontrado: comprobar `complete` y los resultados individuales. El historial de precios conserva cada fecha efectiva y fuente.

La cola y lectura local se separan por implementación y libro. Las solicitudes sin confirmar no se pueden descartar ni editar. El service worker solo cachea archivos públicos de la app; la lectura financiera y los pendientes usan IndexedDB local. No existe envío con la app cerrada. El borrado local se bloquea si quedan pendientes.

## Cola persistente para agentes

`tools/agent-queue.cjs` reutiliza `web/queue.js`: guarda lectura, libro, sobre, referencia y estado antes de enviar; recupera respuestas por el journal. Requiere Node 24 y un cliente de la API privada ya autenticado. No abre sesión ni registra credenciales. Ejemplo dentro del proceso que dispone de ese cliente:

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

Para recuperar tras cierre, abrir la misma cola y llamar `run(client)` sin volver a preparar o encolar la operación. Cada implementación tiene archivo propio, con permisos de usuario, escritura atómica y sincronización a disco. Un libro distinto bloquea el envío; un conflicto queda para revisión. Un archivo corrupto o bloqueo ocupado impide reemplazar la cola. Si el proceso termina durante una escritura, conservar los archivos y retirar el `.lock` solo tras comprobar que ningún proceso lo usa; no borrar pendientes. Ningún adaptador autoriza escribir celdas directamente. Las herramientas OOXML previas quedan para lectura/archivo/recuperación del origen tras el corte; no son un segundo backend real.

## Preparación del uso real y mantenimiento

`comprobarCierre()` en el editor y «Comprobar sistema» en la app hacen la misma comprobación sin escrituras: estructura, cálculos, tarjetas, Bridge, fuentes por ISIN y estabilidad de la revisión. `ok:true` significa que terminó; `technicalReady:true` exige todos los `checks` correctos. No acredita la instalación en un teléfono físico, la autenticación de otra cuenta o la vigencia del origen. La entrega 3.4.0 mantiene API 3.3.0 y sobres antiguos en test; en producción toda mutación/consulta de solicitud requiere el vínculo de libro obtenido de una lectura.

Antes del corte: aceptar pruebas reales, resolver pendientes por dispositivo, comparar fuentes vigentes y guardar copia nativa del principal más código y configuración privada. Mantener el proyecto de pruebas; crear una implementación privada separada para el principal. Preparar su backend con `comprobarPaso4`, comprobar `comprobarCierre` y guardar su nuevo enlace en la app. Nunca copiar operaciones ficticias ni solicitudes pendientes de test al principal. La selección desde el navegador no puede modificar los identificadores configurados en el servidor.

Con Sheets operativo, archivar el XLSX como origen histórico y registrar operaciones solo por la API. Hacer copias completas periódicas y antes de cambios; anotar fecha, revisión y cortes en el seguimiento privado. Para recuperar: detener envíos, preservar actual/colas/journal, restaurar en un libro nuevo, validar fórmulas y entradas y reconciliar cambios posteriores con auditoría y recibos. El reenvío de solicitudes inciertas exige consultar su implementación original; no deduplicar movimientos solo por concepto/importe. Una copia nativa no respalda propiedades ni despliegues de Apps Script.
