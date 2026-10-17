# Finanzas

[![CI](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml/badge.svg)](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml)

Aplicación de finanzas personales con cuentas, movimientos, inversiones, presupuestos y objetivos. La interfaz pública funciona en GitHub Pages; los datos permanecen en Google Sheets y se consultan mediante un Apps Script privado del propietario.

[**Abrir aplicación**](https://manuuelmarin.github.io/finances/) · [Instalar o actualizar el backend](https://manuuelmarin.github.io/finances/install.html)

App **3.10.0** · API **3.3.0** · modelo de libro **3**.

## Instalación y actualización

1. Para una instalación nueva, convierte la [plantilla vacía](templates/finances-model-3.xlsx) completa a Google Sheets y comprueba su [estructura](docs/WORKBOOK.md). Conserva una copia de pruebas separada.
2. Sigue el instalador para copiar los 13 módulos de [`apps-script/modules.json`](apps-script/modules.json), `Bridge.html` y `appsscript.json` a tu proyecto privado de Apps Script.
3. Configura las propiedades `OWNER_EMAIL`, `ENVIRONMENT=test` y `TEST_SPREADSHEET_ID` en Google, nunca en este repositorio.
4. Ejecuta `prepareApplication` y después `checkApplication`. Comprueba versión, entorno, cálculo, resumen y fuentes; `ok:true` solo indica que la comprobación terminó.
5. Implementa como **Yo**, con acceso **Solo yo**, y configura la URL privada en la aplicación. Tras actualizar código, publica una **nueva versión de la misma implementación** para conservar su URL. Publicar GitHub Pages no actualiza Google.

El instalador compara los archivos de una versión instalada conocida. Si la instalación está personalizada o no conoces su versión, revisa todos los archivos. Conserva los hashes históricos de `tools/install-releases.json`; una versión registrada no puede cambiar de contenido.

Para utilizar el libro personal, valida primero una copia aislada. Utiliza otro proyecto y otra implementación privados, `ENVIRONMENT=production` y `PRODUCTION_SPREADSHEET_ID`, conservando también un `TEST_SPREADSHEET_ID` distinto. Mantén disponible la instalación de pruebas. El servidor decide qué libro abrir; cambiar una selección en el navegador no cambia sus propiedades.

## Uso y recuperación

- **Conexión:** abre la sesión de Google con la cuenta propietaria. En Configuración, usa **Comprobar sistema** para revisar la instalación conectada. Acepta las actualizaciones de la PWA y vuelve a abrirla para cargar los nuevos recursos.
- **Operaciones:** revisa antes de confirmar. El cliente conserva una solicitud con UUID, revisión y vínculo al libro; el backend registra cambios, auditoría y recibo en una operación atómica.
- **Respuesta incierta:** conserva la solicitud completa y consulta su recibo en la implementación original. Reintenta el mismo contenido y UUID; no lo edites, descartes ni vuelvas a crear. Una revisión obsoleta exige leer y revisar de nuevo.
- **Cambio de libro o dispositivo:** resuelve los pendientes en su entorno original. Nunca transfieras solicitudes de pruebas al principal ni borres el almacenamiento local con solicitudes sin confirmar.
- **Respaldo:** antes de preparar un libro o actualizar Google, guarda una copia nativa completa del libro y, por separado, código, propiedades y versión de implementación. Una copia de Sheets no acredita el respaldo de la configuración de Apps Script.
- **Restauración:** conserva el libro y los recibos actuales, restaura en otra copia, valida fórmulas y concilia los movimientos posteriores antes de reanudar. Haz las pruebas ficticias en una copia desechable.
- **Precios:** la actualización diaria es opcional. `enableDailyPrices`, `updatePrices` y `disableDailyPrices` usan el entorno configurado. Consulta las [reglas de precios e importación](apps-script/PRICES.md).

Los filtros y las exportaciones no modifican Sheets. La caché PWA guarda recursos públicos; las instantáneas y solicitudes privadas están en el almacenamiento del perfil. Los datos ausentes no se convierten en cero. La [guía de métricas](docs/PORTFOLIO-METRICS.md) explica TWR, TIR, medias, contribuciones y riesgo.

## Desarrollo

Requiere Node.js 24 o posterior.

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run build
node tools/serve.cjs
```

Abre `http://127.0.0.1:4173`. Las pruebas usan datos ficticios y servicios simulados.

| Ruta                | Contenido                                                   |
| ------------------- | ----------------------------------------------------------- |
| `web/`              | Interfaz, conexión, solicitudes pendientes, gráficos y PWA. |
| `apps-script/`      | Autorización, lectura, validación, transacciones y precios. |
| `tools/`            | Instalador, compilación, servidor y adaptadores del agente. |
| `tests/`            | Pruebas de cálculo, backend, recuperación y navegador.      |
| `templates/`        | Libro inicial sin datos financieros.                        |
| `TODO.md` y `TODO/` | Propuestas y estado de las tareas seleccionadas.            |

Edita los módulos y `tools/install-template.html`; regenera `web/install.html`, los hashes CSP y `web/sw.js` con `npm run build`. No edites esos resultados a mano. Una limpieza documental no requiere cambiar la versión de la aplicación.

```sh
npm run check
npm run audit
```

`check` ejecuta compilación, formato, lint y ambas suites. La auditoría de dependencias se ejecuta aparte. CI comprueba también los mensajes de commit y solo publica después de superar `quality`. Las pruebas simuladas no certifican una instalación privada ni un teléfono físico.

Trabaja en una rama y abre un PR con el cambio y su validación. Usa commits `type(scope): descripción`; el scope es opcional. Tipos admitidos: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`, `style`, `revert`. Valida con `node tools/check-commits.cjs BASE_SHA HEAD`.

La [política de protección](.github/rulesets/main.json) debe activarse y verificarse en GitHub; guardar el JSON no la activa. Los cambios deben seguir el flujo de PR y comprobaciones, sin saltarse controles. Conserva fuera del repositorio datos personales, IDs privados, URLs de implementación, recibos y copias financieras. Consulta [Seguridad](SECURITY.md).

Los adaptadores `tools/agent-envelope.cjs` y `tools/agent-queue.cjs` requieren un cliente privado ya autenticado. Guarda su estado fuera del repositorio; al reanudar, abre la misma cola y usa `run(client)` sin volver a encolar solicitudes. Un archivo corrupto o un bloqueo ocupado debe investigarse antes de reemplazarlo.
