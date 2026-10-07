# Finanzas

Entrega 3.3.1. App responsive y PWA sobre el libro completo de Google Sheets, modelo 3. La API 3.3.0 sigue limitada a la copia de pruebas. Google calcula los resultados; la app registra entradas mediante la API privada y muestra los estados por operación.

## Desarrollo y calidad

Node 24. `npm ci --ignore-scripts`, `npx playwright install --with-deps chromium`, `npm run check`. Prettier mantiene el formato; ESLint detecta errores; node:test comprueba reglas, canal, precios y recuperación; Playwright prueba ordenador y móvil con datos ficticios. Actions publica Pages únicamente tras superar calidad. Los commits nuevos siguen Conventional Commits: `feat(app): ...`, `fix(api): ...`, `ci(quality): ...`.

`npm run build` genera el instalador exacto desde los tres archivos de Apps Script y la versión de caché desde los recursos públicos. No editar sus bloques de código a mano. Las dependencias están fijadas en package-lock.json. Las pruebas simuladas no acreditan una implementación privada de Google ni un teléfono físico.

## Uso por agentes

1. Leer el estado por `FinanceApiClient.read()` desde la sesión privada autorizada de Google. El proyecto conserva `TEST_SPREADSHEET_ID`, `OWNER_EMAIL` y `ENVIRONMENT=test` fuera del repositorio. No transmitir IDs de libro, credenciales ni URLs privadas en commits.
2. Preparar operaciones con nombres del negocio o selecciones resueltas. `tools/agent-envelope.cjs` genera una referencia automática y revisión desde la lectura 3.3.0. Los IDs definitivos los genera Apps Script. El adaptador necesita un transporte autenticado; no ofrece un endpoint HTTP público ni evita el inicio de sesión.
3. Guardar el sobre completo antes de enviar. Usar `client.submit(envelope)`. Ante respuesta incierta consultar `client.requestStatus(envelope)` y reintentar exactamente el mismo sobre. Un conflicto exige nueva lectura y revisión explícita; nunca cambiar silenciosamente una solicitud ya enviada.
4. Usar altas, correcciones y anulaciones de `financialApi`; nunca escribir celdas para registrar operaciones. No borrar precios al fallar una fuente, no convertir datos desconocidos en cero y no registrar compras históricas otra vez como caja nueva.
5. El original XLSX se conserva durante pruebas. Su archivo definitivo y la elección de Sheets como única fuente operativa requieren el corte y aceptación del paso 8. Los dos documentos privados de coordinación conservan las referencias y pendientes; no se publican en este repositorio.

## Instalación privada

[Instalador](https://manuuelmarin.github.io/finances/install.html). Copiar los tres archivos, ejecutar `comprobarPaso5`, publicar una nueva versión de Google y abrir el libro desde la app. El resultado general `ok:true` no significa que todos los precios se hayan encontrado: comprobar `complete` y los resultados individuales. El historial de precios conserva cada fecha efectiva y fuente.

La cola y lectura local se separan por implementación y libro. Las solicitudes sin confirmar no se pueden descartar ni editar. El service worker solo cachea archivos públicos de la app; la lectura financiera y los pendientes usan IndexedDB local. No existe envío con la app cerrada. El borrado local se bloquea si quedan pendientes.
