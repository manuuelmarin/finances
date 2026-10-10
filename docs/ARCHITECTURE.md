# Arquitectura

Finanzas 3.8.1 utiliza el modelo de libro 3 y la API 3.3.0. Esta documentación describe el comportamiento vigente; no autoriza cambiar el entorno ni realizar el corte a producción.

## Componentes y fronteras

| Componente                        | Responsabilidad                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| GitHub Pages (`web/`)             | Servir la interfaz, los recursos de la PWA y el instalador públicos.                              |
| Cliente API y Bridge              | Conectar la app con una sesión autenticada de la implementación privada de Google.                |
| Apps Script                       | Autorizar a la cuenta propietaria, validar contratos y operaciones, y escribir lotes financieros. |
| Google Sheets                     | Conservar entradas y tablas, ejecutar fórmulas y proporcionar resúmenes y gráficos nativos.       |
| IndexedDB                         | Guardar la lectura local y los pendientes por implementación y libro.                             |
| Adaptadores de agentes (`tools/`) | Preparar sobres y conservar una cola durable mediante un transporte privado ya autenticado.       |

La autorización se comprueba en el servidor antes de acceder al libro, también en las funciones públicas del editor. Las operaciones admiten procesos y campos concretos; el cliente no elige el identificador del libro ni envía instrucciones de celda. El texto se escribe como `stringValue`, sin convertirlo en una fórmula.

Bridge valida origen, ventana y referencia de sesión. El cliente acepta respuestas del marco y origen exactos establecidos por el saludo autenticado. La primera lectura puede incorporarse al HTML privado de Google tras comprobar la cuenta propietaria, con escape contextual; las siguientes lecturas y operaciones viajan como cadenas JSON. La sesión del libro se reutiliza entre lecturas y comprobaciones, pero no se comparte entre pestañas o libros. Los resultados de una configuración anterior se descartan al cambiar la implementación.

El service worker cachea recursos públicos; la lectura financiera y los pendientes se almacenan aparte en IndexedDB. Una app incrustada no habilita configuración, operaciones ni su copia local: debe abrirse en su propia ventana. Consulta las fronteras del navegador y los límites de la revisión en [SECURITY.md](../SECURITY.md).

## Lectura y fechas

`FinanceApiClient.read()` obtiene tablas, diagnósticos, revisión, vínculo de libro, observaciones, precios, presupuestos y resultados calculados. Los indicadores `backendReady`, `calculationState` y errores de cálculo permiten distinguir datos disponibles de una estructura pendiente de revisión. Los valores desconocidos no deben transformarse en cero.

| Campo                 | Significado                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `revision`            | Huella del estado usado para preparar una escritura; permite detectar cambios concurrentes. |
| `bookKey`             | Vínculo con el libro leído, comprobado en el servidor. No es una credencial.                |
| `settings.start`      | Inicio del seguimiento financiero.                                                          |
| `settings.asof`       | Corte del informe.                                                                          |
| `settings.valuation`  | Fecha de valoración de inversiones.                                                         |
| `supportsBookBinding` | Capacidad de vincular solicitudes al libro leído.                                           |
| `supportsBudgets`     | Capacidad de leer y modificar presupuestos mensuales.                                       |

Las fechas públicas se expresan como fechas ISO. El backend exige que inicio y valoración no sean posteriores al corte. Una operación puede avanzar los cortes aplicables según sus reglas; los filtros de la interfaz son locales y no modifican esas fechas ni la revisión de escritura.

Google calcula los saldos y resultados del libro. La vista de caja reconstruye los saldos diarios desde las bases de las cuentas y los movimientos al corte. Las observaciones externas de saldo son referencias: una observación de cierre de día comparable se contrasta con saldo inicial más entradas menos salidas desde el inicio del seguimiento. Una referencia sin corte comparable no se presenta como conciliada. No registrar compras históricas otra vez como caja nueva ni deduplicar movimientos solo por concepto e importe.

## Escrituras, UUID y recibos

Una transacción contiene `action: 'transact'`, un `requestId` UUID, `expectedRevision`, el vínculo `bookKey` cuando corresponde y entre 1 y 20 operaciones. La referencia de solicitud identifica el sobre completo; los identificadores definitivos de las nuevas entidades los genera Apps Script.

1. Leer el estado con la sesión privada autorizada.
2. Preparar las operaciones con nombres o selecciones resueltas y revisar su efecto.
3. Guardar el sobre completo antes de enviarlo.
4. Enviar mediante `client.submit(envelope)` y conservar el resultado.
5. Si la respuesta es incierta, consultar `client.requestStatus(envelope)` y, si procede, reintentar exactamente el mismo sobre.

El servidor consulta el journal de solicitudes antes de comparar la revisión: una solicitud ya aplicada puede recuperar su recibo aunque el libro haya cambiado después. El mismo UUID con contenido distinto devuelve `REQUEST_CONFLICT`. Una solicitud nueva con revisión antigua devuelve `CONFLICT` y exige releer y revisar explícitamente una nueva propuesta.

Entradas, cambios financieros, auditoría y recibo se registran en un único lote. Si falla la confirmación del lote, el servidor intenta recuperar el recibo y puede devolver `WRITE_UNCERTAIN`. La cola mantiene la escritura como enviada sin confirmar: no permite descartarla, editarla o crear otra como sustitución silenciosa. `RESPONSE_UNCERTAIN` conserva la misma protección en app y agentes.

En producción, toda mutación y consulta de solicitud exige el vínculo obtenido de una lectura. El entorno `test` conserva compatibilidad con sobres anteriores; esto no elimina la obligación de separar libros y revisar la configuración del servidor.

## Presupuestos y cálculos de la interfaz

Los límites pertenecen a un mes concreto y pueden ser totales o por subcategoría de gasto. Cero es válido. No crean movimientos ni se replican a otros meses. Gasto propio equivale a gasto menos parte recuperable y devoluciones propias, desde el inicio del seguimiento hasta el corte del informe; transferencias, compras, cobros compartidos y deuda quedan excluidos.

El límite total y los de categoría se muestran independientemente. No se suman como patrimonio ni para inventar un saldo libre si falta el límite global. Los objetivos mantienen sus asignaciones en `tObjetivos` y `tAsignaciones`.

La hoja oculta `_Finanzas_Presupuestos` se prepara con el backend o al confirmar el primer límite. El estado se registra como entero 1/0; cambios, auditoría y recibo forman parte del lote financiero. Cambiar un límite cambia la revisión; renombrar una subcategoría conserva sus límites. App y agentes usan los procesos `presupuesto` y `quitar_presupuesto`.

Los gráficos combinan resultados nativos del libro y series calculadas a partir de la lectura. No cargan bibliotecas externas. Sus datos son accesibles y los filtros no escriben en Sheets. Las calculadoras utilizan parámetros explícitos y supuestos constantes; sus resultados son estimaciones.

## Precios y rentabilidad

Las cotizaciones consultan rutas HTTPS fijas de VDOS/Quefondos por ISIN validado, sin seguir redirecciones ni ejecutar HTML del proveedor. Cada precio conserva fecha efectiva y fuente. Un fallo no borra la última cotización, y un precio atrasado o un conflicto no se presenta como actualización completada.

La rutina diaria voluntaria utiliza un trigger horario, una ventana entre las 20 y 22 h de Madrid y hasta tres intentos por lote y día. La desactivación y el cambio de libro se revalidan después de consultar la red, antes de guardar. El permiso `script.scriptapp` permite administrar triggers del proyecto; el código crea o retira su propia rutina. Su activación requiere intervención de la cuenta propietaria en Google, con `activarActualizacionDiariaPreciosTest` y `ENVIRONMENT=test`.

El proveedor ofrece las cotizaciones disponibles; no se ha reconstruido el histórico diario anterior. Las series no interpolan ni aplican retrospectivamente el último valor. La variación de valor liquidativo de un producto comienza en su primera cotización observada. TWR enlaza valoraciones reales sin flujos intermedios; un flujo sin valoración suficiente interrumpe el cálculo. Si falta el inicio histórico, se identifica el tramo calculable y su fecha, con rendimiento anterior desconocido. El resultado sobre aportación neta no sustituye TWR ni la rentabilidad nativa por producto. Véase [PRICES.md](../apps-script/PRICES.md).

## Agentes y persistencia

`tools/agent-envelope.cjs` prepara UUID y revisión a partir de una lectura 3.3.0. `tools/agent-queue.cjs` reutiliza `web/queue.js` y conserva lectura, libro, sobre, referencia y estado antes del envío. Ambos necesitan un cliente de API privada ya autenticado; no abren sesión ni ofrecen un endpoint público.

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

Tras un cierre, abrir la misma cola y llamar a `run(client)` sin volver a preparar o encolar la operación. Cada implementación usa su archivo, permisos de usuario, escritura atómica y sincronización a disco. Un libro distinto bloquea el envío; los conflictos requieren revisión. Un archivo corrupto o un bloqueo ocupado impiden reemplazar la cola. Antes de retirar un `.lock`, comprobar que ningún proceso lo utiliza y conservar los archivos pendientes.

## Entornos, comprobaciones y recuperación

El proyecto de pruebas mantiene `TEST_SPREADSHEET_ID`, `OWNER_EMAIL` y `ENVIRONMENT=test` fuera del repositorio. Producción requiere un proyecto e implementación separados, `PRODUCTION_SPREADSHEET_ID` distinto y `ENVIRONMENT=production`. Seleccionar otra implementación desde el navegador no cambia la configuración de Google. No publicar identificadores de libro, URLs privadas ni credenciales.

`comprobarCierre()` y «Comprobar sistema» realizan comprobaciones sin escrituras: estructura, cálculos, tarjetas, Bridge, fuentes por ISIN y estabilidad de revisión. `ok: true` indica que terminaron; `technicalReady: true` requiere todos los `checks` correctos. No acreditan un teléfono físico, el rechazo de otra cuenta ni la vigencia del origen.

Antes de un corte autorizado, aceptar pruebas reales, resolver los pendientes de cada dispositivo, comparar fuentes vigentes y conservar copia nativa del libro, código y configuración privada. Preparar el backend del principal con `comprobarPaso4`, comprobar `comprobarCierre` y guardar su enlace propio en la app. No trasladar operaciones ficticias ni pendientes de test. Con Sheets aceptado como fuente operativa, el XLSX original queda archivado; las herramientas OOXML previas sirven para lectura o recuperación del origen, no como segundo backend.

Para recuperar, detener envíos y preservar el libro actual, las colas y el journal; restaurar en un libro nuevo, validar fórmulas y entradas y reconciliar cambios posteriores mediante auditoría y recibos. Consultar las solicitudes inciertas en su implementación original antes de reenviar. Una copia nativa de Sheets no respalda propiedades ni despliegues de Apps Script. Conservar copias completas periódicas y antes de cambios, con fecha, revisión y cortes en el seguimiento privado.

GitHub Actions comprueba y publica los recursos de Pages. Esa publicación no modifica los tres archivos ni la versión de una implementación privada en Google. El instalador y la caché se generan desde las fuentes; consulta [DEVELOPMENT.md](DEVELOPMENT.md) para mantenerlos.
