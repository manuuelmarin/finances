# Workbook compatibility guide

This is the model 3 workbook compatibility reference. The app expects ten business sheets, twelve native Google Sheets tables with exact names and column headers, native formulas, settings, and calculation ranges—not just similarly named tabs or imported CSV files. Renaming a sheet, table, or column—or replacing a native table with a plain cell range—makes the workbook incompatible. See Google's guides for [creating native tables](https://support.google.com/docs/answer/14239833?hl=en) and their [Sheets API table model](https://developers.google.com/workspace/sheets/api/guides/tables).

This repository contains a schema reference, not a public ready-to-copy workbook. Do not use another person's private book as a template. `prepareApplication` does **not** create the ten business sheets, their native tables, or a missing native summary. Once the required layout and formula anchors exist, it can initialize backend-owned technical sheets, extend table/support capacity, and regenerate canonical support formulas; it is not a workbook generator or a substitute for validating financial formulas.

## Required sheets and tables

All tables start with the exact headers below in the exact order. “Inputs” are the columns the app reads as user data; formula-managed columns must retain working native Sheets formulas and are not CSV inputs.

Each native table range must include its header row and at least one data or template row. Table positions are read from Sheets table metadata rather than fixed cell addresses.

| Sheet | Native table | Exact headers (left to right) | Inputs | Formula-managed |
| --- | --- | --- | --- |
| `Movimientos` | `tMovimientos` | `ID`, `Fecha`, `Tipo`, `Concepto`, `Subcategoría`, `Origen`, `Destino`, `Importe`, `Recuperable`, `Localización`, `Recurrente` | All columns | — |
| `Inversiones` | `tProductos` | `ID`, `Producto`, `Cuenta`, `Clase`, `Fecha base`, `Unidades base`, `Coste base`, `Participaciones`, `Aportado neto`, `Valor`, `Resultado`, `Rentabilidad`, `Peso` | `ID` through `Coste base` | `Participaciones` through `Peso` |
| `Inversiones` | `tOperaciones` | `ID`, `Fecha`, `Producto`, `Tipo`, `Participaciones`, `Precio`, `Comisión`, `Retención`, `Importe`, `Movimiento` | All except `Importe` | `Importe` |
| `Inversiones` | `tPrecios` | `Producto`, `Fecha`, `VL EUR`, `Fuente` | All columns | — |
| `Cuentas` | `tCuentas` | `Cuenta`, `Saldo inicial`, `Saldo real`, `Fecha saldo`, `Saldo calculado` | First four columns | `Saldo calculado` |
| `Cuentas` | `tDeudas` | `ID`, `Acreedor`, `Saldo inicial`, `Saldo pendiente` | First three columns | `Saldo pendiente` |
| `Cuentas` | `tVinculos` | `Movimiento`, `Vinculado a`, `Fecha`, `Tipo`, `Importe` | `Movimiento`, `Vinculado a` | `Fecha`, `Tipo`, `Importe` |
| `Salario` | `tNominas` | `Movimiento`, `Fecha cobro`, `Neto`, `Bruto`, `Cotización`, `IRPF`, `Otras deducciones` | `Movimiento`, `Bruto`, `Cotización`, `IRPF`, `Otras deducciones` | `Fecha cobro`, `Neto` |
| `Objetivos` | `tObjetivos` | `ID`, `Objetivo`, `Meta`, `Fecha`, `Asignado`, `Pendiente`, `Avance` | First four columns | `Asignado`, `Pendiente`, `Avance` |
| `Objetivos` | `tAsignaciones` | `Objetivo`, `Origen`, `Importe` | All columns | — |
| `Configuración` | `tParametros` | `Parámetro`, `Valor` | Both columns | — |
| `Configuración` | `tCategorias` | `Grupo`, `Subgrupo`, `Categoría`, `Subcategoría` | All columns | — |

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

Six named calculation blocks are expected. `prepareApplication` can discover/create their named ranges from the matching header rows and maintain capacity, but the formulas and anchors must already be correct:

| Named range                   | Anchor area             | Header signature                                            | Width |
| ----------------------------- | ----------------------- | ----------------------------------------------------------- | ----: |
| `Finanzas_CalculoMovimientos` | `Cálculos`, column B    | `ID`, `Fecha`, `Tipo`                                       |    13 |
| `Finanzas_CalculoCategorias`  | `Cálculos`, column B    | `Categoría`, `Gasto propio`                                 |     5 |
| `Finanzas_HistoricoProductos` | `Cálculos`, column B    | `Mes`, `Producto`, `Corte`                                  |    10 |
| `Finanzas_GraficoProductos`   | `Cálculos`, column E    | `Producto`, `Valor`                                         |     2 |
| `Finanzas_MesesInversiones`   | `Inversiones`, column B | `Mes`, `Capital invertido`, `Valor de mercado`, `Resultado` |     4 |
| `Finanzas_GraficoCiudades`    | `Cálculos`, column P    | `Localización`, `Gasto propio`                              |     2 |

The first three header signatures are located in column B within the calculation sheet's support area; keep each block distinct and its following formula rows intact. `Cálculos!T8` is managed capacity metadata written by preparation, not a user input. Do not edit or repurpose it.

## Technical and generated sheets

Preparation creates missing backend-owned technical sheets as needed. Names are `_Finanzas_Solicitudes`, `_Finanzas_Auditoria`, `_Finanzas_Observaciones`, `_Finanzas_Fondos`, `_Finanzas_Cotizaciones`, `_Finanzas_TraspasosFondos`, `_Finanzas_Migraciones`, `_Finanzas_Archivados`, `_Finanzas_Plantillas`, `_Finanzas_Obligaciones`, and `_Finanzas_Presupuestos`. These hold receipts, audit/recovery state, bindings and optional feature history; they are not user inputs. Do not rename, edit, or delete them during normal operation.

`Histórico` is an app-generated view, not a required input sheet or a source of prices. It is marked as generated; an unrelated existing sheet with that name is preserved. `tPrecios` remains the price-history source. Do not edit the generated view as if it were source data.

## Making a compatible, anonymized copy

1. Start from a workbook you own that already implements model 3, or build a fresh workbook by following the exact schema above and reproducing its native formulas, named ranges, data validation, and summary calculations. This guide is a compatibility reference, not a ready-to-copy model or generator. Do not assume an ordinary spreadsheet or CSV import is a compatible starting point.
2. For an anonymized copy, use a clean compatible baseline rather than a live or migrated workbook. Replace or clear data only in the listed input columns; keep headers, native tables, formula-managed columns, formulas, named ranges, and sheet structure. Do not delete technical tabs or clear their histories from a migrated workbook: they may contain receipts, audit records, or guarded formula-migration backups needed for recovery. Use a separately created test workbook/backend for new technical history, and inspect the full copy for identifying details before sharing it.
3. Enter your own baseline deliberately. Use `Saldo inicial` for account opening balances and `Saldo real` with its actual `Fecha saldo` for observations. For an investment holding, use `Fecha base`, `Unidades base` and `Coste base` to describe the baseline; add only verified prices and subsequent operations. Set the three date parameters to your own valid dates. Do not invent historical transactions to make totals appear to reconcile.
4. Create and configure your own private Apps Script project and Google account access, using your own test workbook and private deployment URL. Set `OWNER_EMAIL`, `ENVIRONMENT=test`, and `TEST_SPREADSHEET_ID` privately. Follow the [private backend installer](https://manuuelmarin.github.io/finances/install.html) and the test-first [operations guide](OPERATIONS.md). Keep the web-app deployment restricted to the owner (`Solo yo`), then run preparation and checks on test first. A repository fork does not inherit a working backend or private URL.
5. The current app origin is fixed in `APP_ORIGIN_` in `apps-script/Configuration.gs`, and the Bridge return link is tied to this app's hosted origin. A fork hosted elsewhere must update and verify the app/Bridge origin and its private backend together. Do not make the Google deployment public to simplify setup.

## Source of truth and limits

This guide summarizes the current contract in [`Configuration.gs`](../apps-script/Configuration.gs): `REQUIRED_SHEETS_`, `TABLE_SCHEMA_`, `INPUT_SCHEMA_`, `TECH_SCHEMA_`, and `SUPPORT_NAMES_`. Structural checks are in [`AccessAndUtilities.gs`](../apps-script/AccessAndUtilities.gs), capacity and formula preparation in [`SupportAndCapacity.gs`](../apps-script/SupportAndCapacity.gs), and native summary/chart interpretation in [`BackendAndReporting.gs`](../apps-script/BackendAndReporting.gs). Consult those files before changing a copied model. The repository does not publish a sample Sheets workbook or a generator that can safely create a financially correct workbook.
