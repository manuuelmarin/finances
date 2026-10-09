# Cotizaciones y acumulación de históricos

`refreshPrices` conserva su contrato de revisión, libro, UUID y receipt. Cada NAV confirmado se añade una sola vez a `tPrecios` con su **fecha efectiva publicada**, nunca con la fecha de consulta. Un conflicto de precio para la misma fecha requiere revisión. Las consultas fallidas conservan el último precio y quedan registradas en cotizaciones y auditoría.

## Fuentes y límites verificados (9 octubre 2026)

La [ficha Quefondos](https://www.quefondos.com/es/fondos/ficha/index.html?isin=ES0112611001) publica nombre, ISIN, divisa y bloque «Última valoración» con NAV EUR y fecha. El ISIN del enlace es un ejemplo de investigación, no un catálogo del código. La [ficha móvil](https://www.quefondos.com/m/es/fondos/ficha/index.html?isin=ES0112611001) puede publicar una fecha diferente: cada respuesta conserva su fecha, sin escoger otra clase o aproximar el nombre. Se consulta la variante móvil oficial si la clásica falla por HTTP, red o formato, pero nunca después de una incoherencia de identidad, clase, divisa, fecha o precio.

La [ayuda de Quefondos](https://www.quefondos.com/es/fondos/ficha/ayuda_ficha.html) describe un gráfico histórico. En el HTML real, `var fondo` contiene muestras mensuales y la última muestra. El [JavaScript oficial](https://www.quefondos.com/opencms/export/system/modules/com.vdos.site.qf.templates/resources/js/infofiucaract-lib.js) usa `corrigeArray` para rellenar huecos y transforma valores a rentabilidades EUR base 100. Los cortes de fin de mes incluyen días no laborables y no acreditan fechas efectivas individuales de NAV. No se importan como serie diaria a `tPrecios`.

[VDOS](https://www.vdos.com/es/datos.html) ofrece valores liquidativos y series históricas con datos de gestoras. No se ha verificado un endpoint público diario genérico con identidad/clase/divisa por fila. [Vanguard](https://www.vanguard.co.uk/professional/product/fund/bond/9132/20-year-euro-treasury-index-fund-euro-shares) sí publica tablas de NAV históricos y descarga para clases concretas; esto no demuestra acceso uniforme por ISIN para todas las gestoras. Completar el histórico anterior a la instalación requiere una fuente histórica exportable verificada por clase y moneda, y un adaptador adicional. La aplicación debe mostrar esta carencia; no debe usar el NAV actual retrospectivamente ni interpolar.

## Actualización diaria voluntaria del libro de pruebas

Al actualizar `Code.gs`, copia también el manifiesto `appsscript.json` vigente. Incluye el permiso mínimo `https://www.googleapis.com/auth/script.scriptapp`, requerido para [crear, consultar y eliminar triggers](https://developers.google.com/apps-script/reference/script/script-app). Google exigirá reautorizar el proyecto con ese permiso al ejecutar la instalación desde el editor; aceptar el permiso no instala por sí solo la rutina.

Estas funciones se ejecutan **desde el editor Apps Script por el dueño**:

- `activarActualizacionDiariaPreciosTest`: instala una vez un trigger diario hacia las 20 h Madrid y vincula expresamente la rutina al ID del libro de pruebas.
- `desactivarActualizacionDiariaPreciosTest`: retira únicamente los triggers de esta rutina y desactiva el vínculo.
- `actualizacionDiariaPreciosTest`: acumula NAV reales usando `refreshPrices`, lotes de hasta veinte productos y receipts UUID estables por fecha, libro, selección e intento. Una respuesta perdida recupera el receipt; un resultado parcial permite hasta tres intentos por lote y día. Un día completado se omite. La rutina se detiene al cambiar a producción o al cambiar el ID del libro.

Publicar este código no instala el trigger. Las funciones públicas verifican el usuario activo con la autorización existente. El handler privado `actualizacionDiariaPreciosTest_` verifica dueño efectivo, entorno de pruebas, libro activado y UID del trigger instalado antes de escribir; su sufijo impide invocarlo desde `google.script.run`. Los [triggers instalables](https://developers.google.com/apps-script/guides/triggers/installable) se ejecutan bajo la cuenta de su creador.

Las consultas inician nuevos fondos durante un máximo de dos minutos por lote y la rutina inicia nuevos lotes durante tres minutos. Una petición de red ya iniciada depende del timeout de Google. Tras alcanzar el presupuesto temporal, los fondos pendientes reciben `TIME_BUDGET` y conservan su precio. No se cambia dinero ni participaciones; las fechas de corte siguen la regla monotónica existente al guardar NAV.

## Diagnóstico

`responseInfo` incluye estado HTTP, URL oficial, presencia de identidad y etiquetas, título acotado y hash de respuesta, junto a los intentos. No expone el cuerpo de la fuente ni mensajes privados de excepciones de red. Los fallos distinguen `SOURCE_HTTP_ERROR`, `SOURCE_RATE_LIMITED`, `NETWORK_ERROR`, formato, identidad y fecha. `historyAvailability.status = LATEST_ONLY` declara el alcance real de la consulta.

Validación local: pruebas de cotizaciones, identidad y clase, conflictos, repetición de UUID, fallos parciales, migraciones, huecos mensuales y lifecycle/retries del trigger con servicios simulados. No se instalaron triggers ni se escribieron libros de Google durante esta implementación.
