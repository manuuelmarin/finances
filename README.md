# Finanzas

[![Calidad y publicación](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml/badge.svg)](https://github.com/manuuelmarin/finances/actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-abrir%20app-0969da)](https://manuuelmarin.github.io/finances/)

Aplicación personal de finanzas, responsive e instalable como PWA. Google Sheets conserva el libro y calcula sus resultados; una implementación privada de Google Apps Script valida las lecturas y operaciones de la cuenta propietaria. La web pública proporciona la interfaz y el instalador, sin incluir el libro ni su configuración privada.

**Entrega 3.8.1 · API 3.3.0 · modelo 3.** El entorno de trabajo permanece en `test`; publicar GitHub Pages no actualiza Apps Script, instala rutinas en Google ni activa producción.

[Abrir app](https://manuuelmarin.github.io/finances/) · [Instalar](https://manuuelmarin.github.io/finances/install.html) · [Guía de desarrollo](docs/DEVELOPMENT.md) · [Arquitectura](docs/ARCHITECTURE.md) · [Seguridad](SECURITY.md) · [Cambios](CHANGELOG.md) · [Cotizaciones](apps-script/PRICES.md)

## Qué permite hacer

| Sección      | Funciones vigentes                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Resumen      | Patrimonio, inversión, caja y presupuesto mensual; gráficos con inspección por fecha.                      |
| Movimientos  | Consultar, filtrar y registrar gastos, ingresos y transferencias; revisar los detalles antes de confirmar. |
| Inversiones  | Productos, compras, ventas, posiciones y cotizaciones; aportaciones, valor y rentabilidad por periodos.    |
| Cuentas      | Cuentas, saldos, deudas y observaciones de saldo al corte.                                                 |
| Presupuestos | Crear, editar y retirar límites mensuales totales o por subcategoría.                                      |
| Salario      | Nóminas, evolución y ahorro mensual sobre ingreso neto y gasto propio.                                     |
| Objetivos    | Consultar metas y asignaciones de ahorro.                                                                  |
| Actividad    | Seguir pendientes y consultar el historial de operaciones confirmadas.                                     |
| Calculadoras | Estimar plazo, aportación y colchón de liquidez con supuestos explícitos.                                  |
| Ajustes      | Conexión privada, categorías, fechas, diagnósticos, almacenamiento e instalación.                          |

La app guarda una lectura local para consulta sin conexión y una cola persistente de operaciones. Una operación enviada solo se considera confirmada con la respuesta o el recibo del servidor; ante una respuesta incierta se recupera la misma solicitud. La cola no envía operaciones con la app cerrada; la rutina diaria de precios se ejecuta por separado en Google.

## Uso e instalación privada

1. Abrir el [instalador](https://manuuelmarin.github.io/finances/install.html) y seguir sus instrucciones para los tres archivos de Apps Script y la configuración privada del libro de pruebas.
2. Ejecutar las comprobaciones indicadas y publicar una nueva versión de la implementación de Google con acceso **Solo yo**.
3. Guardar su enlace en la app y abrir el libro con la cuenta propietaria. Revisar los resultados individuales de los diagnósticos: `ok: true` indica que la comprobación terminó, no que todas las condiciones o cotizaciones estén completas.

La actualización diaria de cotizaciones es voluntaria y requiere instalar el código correspondiente y activarla en Google. VDOS/Quefondos aporta las cotizaciones disponibles por ISIN; los fallos conservan el último precio. La fuente no reconstruye un histórico diario completo. Los gráficos usan precios reales disponibles y la rentabilidad TWR solo se muestra en tramos con valoraciones suficientes y fecha de inicio identificada. Consulta [fuentes y límites históricos](apps-script/PRICES.md).

La lectura financiera y los pendientes del navegador se guardan en IndexedDB, sin cifrado propio de la app. Utiliza un dispositivo y perfil de confianza; resuelve los pendientes antes de borrar la copia local desde Ajustes. Los controles y las pruebas no garantizan la ausencia de vulnerabilidades. Lee [Seguridad](SECURITY.md) antes de usar datos reales.

## Desarrollo y calidad

Requiere Node.js 24 o superior. CI utiliza Node 24. Para preparar el proyecto y ejecutar las comprobaciones:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run check
```

`check` genera los recursos de instalación, comprueba el formato con Prettier, ejecuta ESLint y las pruebas de Node y Playwright. La integración continua añade la auditoría de dependencias; la publicación en Pages depende de superar calidad. Las pruebas usan datos ficticios y no validan por sí solas una implementación privada de Google o un teléfono físico.

La [guía de desarrollo](docs/DEVELOPMENT.md) describe los comandos y recursos generados. Para proponer cambios, consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## Estructura del repositorio

| Ruta           | Contenido                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| `web/`         | Interfaz pública, cliente API, cola local, gráficos y PWA.                       |
| `apps-script/` | Backend privado, puente autenticado, manifiesto y documentación de cotizaciones. |
| `tools/`       | Generación de instalador y caché, comprobaciones y adaptadores para agentes.     |
| `tests/`       | Pruebas de reglas, API, recuperación y navegador.                                |
| `docs/`        | Guía de desarrollo y arquitectura.                                               |
| `.github/`     | Integración continua y configuración de colaboración.                            |

`web/install.html` y `web/sw.js` se generan con `npm run build`: modifica sus fuentes, no sus bloques generados. La [arquitectura](docs/ARCHITECTURE.md) explica los contratos de lectura, revisión, recibos y recuperación.
