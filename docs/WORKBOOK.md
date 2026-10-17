# Workbook compatibility guide

This is the model 3 workbook compatibility reference. The app expects ten business sheets, twelve native Google Sheets tables with exact names and column headers, native formulas, settings, and calculation ranges—not just similarly named tabs or imported CSV files. Renaming a sheet, table, or column—or replacing a native table with a plain cell range—makes the workbook incompatible. See Google's guides for [creating native tables](https://support.google.com/docs/answer/14239833?hl=en) and their [Sheets API table model](https://developers.google.com/workspace/sheets/api/guides/tables).

The repository includes a blank, validated model 3 workbook at [`templates/finances-model-3.xlsx`](../templates/finances-model-3.xlsx). `prepareApplication` initializes backend-owned technical sheets, extends table/support capacity, and regenerates canonical support formulas; it does not create the business sheets or replace their native formulas.

## Required sheets and tables

All tables start with the exact headers below in the exact order. “Inputs” are the columns the app reads as user data; formula-managed columns must retain working native Sheets formulas and are not CSV inputs.

Each native table range must include its header row and at least one data or template row. Table positions are read from Sheets table metadata rather than fixed cell addresses.

### `tMovimientos` · `Movimientos`

Columns, in order: `ID`, `Fecha`, `Tipo`, `Concepto`, `Subcategoría`, `Origen`, `Destino`, `Importe`, `Recuperable`, `Localización`, `Recurrente`.

Inputs: All columns. Calculated: —.

### `tProductos` · `Inversiones`

Columns, in order: `ID`, `Producto`, `Cuenta`, `Clase`, `Fecha base`, `Unidades base`, `Coste base`, `Participaciones`, `Aportado neto`, `Valor`, `Resultado`, `Rentabilidad`, `Peso`.

Inputs: `ID` through `Coste base`. Calculated: `Participaciones` through `Peso`.

### `tOperaciones` · `Inversiones`

Columns, in order: `ID`, `Fecha`, `Producto`, `Tipo`, `Participaciones`, `Precio`, `Comisión`, `Retención`, `Importe`, `Movimiento`.

Inputs: All except `Importe`. Calculated: `Importe`.

### `tPrecios` · `Inversiones`

Columns, in order: `Producto`, `Fecha`, `VL EUR`, `Fuente`.

Inputs: All columns. Calculated: —.

### `tCuentas` · `Cuentas`

Columns, in order: `Cuenta`, `Saldo inicial`, `Saldo real`, `Fecha saldo`, `Saldo calculado`.

Inputs: First four columns. Calculated: `Saldo calculado`.

### `tDeudas` · `Cuentas`

Columns, in order: `ID`, `Acreedor`, `Saldo inicial`, `Saldo pendiente`.

Inputs: First three columns. Calculated: `Saldo pendiente`.

### `tVinculos` · `Cuentas`

Columns, in order: `Movimiento`, `Vinculado a`, `Fecha`, `Tipo`, `Importe`.

Inputs: `Movimiento`, `Vinculado a`. Calculated: `Fecha`, `Tipo`, `Importe`.

### `tNominas` · `Salario`

Columns, in order: `Movimiento`, `Fecha cobro`, `Neto`, `Bruto`, `Cotización`, `IRPF`, `Otras deducciones`.

Inputs: `Movimiento`, `Bruto`, `Cotización`, `IRPF`, `Otras deducciones`. Calculated: `Fecha cobro`, `Neto`.

### `tObjetivos` · `Objetivos`

Columns, in order: `ID`, `Objetivo`, `Meta`, `Fecha`, `Asignado`, `Pendiente`, `Avance`.

Inputs: First four columns. Calculated: `Asignado`, `Pendiente`, `Avance`.

### `tAsignaciones` · `Objetivos`

Columns, in order: `Objetivo`, `Origen`, `Importe`.

Inputs: All columns. Calculated: —.

### `tParametros` · `Configuración`

Columns, in order: `Parámetro`, `Valor`.

Inputs: Both columns. Calculated: —.

### `tCategorias` · `Configuración`

Columns, in order: `Grupo`, `Subgrupo`, `Categoría`, `Subcategoría`.

Inputs: All columns. Calculated: —.

The other required business-sheet names are `Resumen financiero`, `Inflación`, `Hipoteca` and `Cálculos`. The complete required set is: `Resumen financiero`, `Movimientos`, `Inversiones`, `Cuentas`, `Salario`, `Objetivos`, `Inflación`, `Hipoteca`, `Configuración`, `Cálculos`.

## Settings and native calculations

`tParametros` must contain exactly one row for each required parameter:

| `Parámetro`              | Required `Valor`                                      |
| ------------------------ | ----------------------------------------------------- |
| `Inicio seguimiento`     | Valid Sheets date serial or exact `YYYY-MM-DD` string |
| `Fecha informe`          | Valid Sheets date serial or exact `YYYY-MM-DD` string |
| `Valoración inversiones` | Valid Sheets date serial or exact `YYYY-MM-DD` string |
| `Moneda`                 | Exact text `EUR`                                      |
| `Versión modelo`         | Numeric value `3` (not text)                          |

Use native date cells where possible so workbook formulas behave as expected. If supplied as text, the only accepted form is an exact, valid `YYYY-MM-DD` string; arbitrary locale-formatted date strings are rejected. Date logic converts accepted values to numeric Sheets dates.

The app reads the native summary range `Resumen financiero!B2:U80`. It needs two rows of headings, each followed by a row whose corresponding formula results are finite numbers:

- `Patrimonio neto`, `Efectivo`, `Inversiones`, `Deuda`
- `Ingresos`, `Gastos propios`, `Ahorro`, `Tasa de ahorro`

Keep the workbook's native formulas and their references. A static copy of displayed values is not equivalent. The app also reads the monthly chart headings `Mes`, `Ingresos`, `Gastos`, `Efectivo` from this range when present.

Seven named calculation blocks are expected. `prepareApplication` can discover/create their named ranges from the matching header rows and maintain capacity, and regenerates their canonical formulas:

- `Finanzas_CalculoMovimientos` (`Cálculos`, column B; 13 columns): `ID`, `Fecha`, `Tipo`.
- `Finanzas_ResumenMensual` (`Cálculos`, column B; 6 columns): `Mes`, `Ingresos`, `Gastos`, `Ahorro`, `Efectivo`.
- `Finanzas_CalculoCategorias` (`Cálculos`, column B; 5 columns): `Categoría`, `Gasto propio`.
- `Finanzas_HistoricoProductos` (`Cálculos`, column B; 10 columns): `Mes`, `Producto`, `Corte`.
- `Finanzas_GraficoProductos` (`Cálculos`, column E; 2 columns): `Producto`, `Valor`.
- `Finanzas_MesesInversiones` (`Inversiones`, column B; 4 columns): `Mes`, `Capital invertido`, `Valor de mercado`, `Resultado`.
- `Finanzas_GraficoCiudades` (`Cálculos`, column P; 2 columns): `Localización`, `Gasto propio`.

The movement, monthly, category and product-history header signatures are located in column B within the calculation sheet's support area; keep each block distinct and its following formula rows intact. `Cálculos!T8` is managed capacity metadata written by preparation, not a user input. Do not edit or repurpose it.

## Technical and generated sheets

Preparation creates missing backend-owned technical sheets as needed. Names are `_Finanzas_Solicitudes`, `_Finanzas_Auditoria`, `_Finanzas_Observaciones`, `_Finanzas_Fondos`, `_Finanzas_Cotizaciones`, `_Finanzas_TraspasosFondos`, `_Finanzas_Migraciones`, `_Finanzas_Archivados`, `_Finanzas_Plantillas`, `_Finanzas_Obligaciones`, `_Finanzas_Presupuestos`, and `_Finanzas_PresupuestosIntervalos`. These hold receipts, audit/recovery state, bindings and optional feature history; they are not user inputs. Do not rename, edit, or delete them during normal operation.

`Histórico` is an app-generated view, not a required input sheet or a source of prices. It is marked as generated; an unrelated existing sheet with that name is preserved. `tPrecios` remains the price-history source. Do not edit the generated view as if it were source data.

## Use the blank workbook

Download [`templates/finances-model-3.xlsx`](../templates/finances-model-3.xlsx), upload it to Drive, open it with Google Sheets, then use **File → Save as Google Sheets** to convert the **whole workbook**. Do not import CSV files, ranges, or individual tabs. The template has empty financial inputs, model version 3, EUR, and all three date parameters set to the numeric Sheets date for 1 January 2026; change the dates and report year to suit your model, then create your own accounts, categories, and products in the app.

Create your own private Apps Script project and test workbook. Follow the [private backend installer](https://manuuelmarin.github.io/finances/install.html), set `OWNER_EMAIL`, `ENVIRONMENT=test`, and `TEST_SPREADSHEET_ID` in your own script properties, then run `prepareApplication` and `checkApplication`. Publish the same deployment as **Me** with access set to **Only me** and configure your private URL in the app. The workbook contains no credentials, and public app code does not grant access to your backend.

With no income, the underlying savings rate remains blank; the summary displays zero for that state, including when expenses exist. The formula does not suppress errors. The workbook's city-series defaults are Madrid, Alicante, La Manga, Albacete, and N/A, matching the app's public choices.

The app origin is fixed in `APP_ORIGIN_` in `apps-script/Configuration.gs`, and the Bridge return link uses the hosted app origin. A fork hosted elsewhere must update and verify the app and Bridge origins with its private backend; do not make the Google deployment public to simplify setup.

## Source of truth and limits

This guide summarizes the current contract in [`Configuration.gs`](../apps-script/Configuration.gs): `REQUIRED_SHEETS_`, `TABLE_SCHEMA_`, `INPUT_SCHEMA_`, `TECH_SCHEMA_`, and `SUPPORT_NAMES_`. Structural checks are in [`AccessAndUtilities.gs`](../apps-script/AccessAndUtilities.gs), capacity and formula preparation in [`SupportAndCapacity.gs`](../apps-script/SupportAndCapacity.gs), and native summary/chart interpretation in [`BackendAndReporting.gs`](../apps-script/BackendAndReporting.gs). Consult those files before changing a copied model. The template is a starting point; run `checkApplication` on your own native copy before entering real data.

## Prices

`tPrecios` is the NAV source. Daily updates validate ISIN, share class, currency, effective date and provider identity. An older or conflicting quote never overwrites a newer verified price; weekends and missing publications do not create artificial observations.

Historical CSV columns: `isin,referenceName,classCurrency,quoteCurrency,date,price,provider,sourceUrl,exportedAt`. Preserve dates and precision, use EUR quotes and identify the exact share class and provenance. The app previews imports in chunks of at most 20 rows. Equal existing observations are duplicates; conflicts reject the chunk. Imports never change holdings or cash. Reviewed exports are identified as owner-reviewed, not independently certified.

`Histórico` is a generated view of exact stored quotes. It stays blank on unsupported dates and is not an input. Daily prices are optional: `enableDailyPrices`, `updatePrices` and `disableDailyPrices` use the configured environment. The schedule checks Madrid hours 20, 21 and 22, with bounded retries, locks and receipt recovery. A successful request does not imply a newly published NAV. Inspect scheduling/publication status in diagnostics before reactivating a missing or incorrectly bound trigger.

The trigger is bound to its owner, workbook and script project. Reconfigure it explicitly after copying a project. Keep pending UUIDs and query their original receipts when recovering. Never copy another book's receipts or use current quotes to fill historical gaps.
