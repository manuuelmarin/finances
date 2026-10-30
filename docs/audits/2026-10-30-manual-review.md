# Revisión manual de la batería

La revisión parte del [inventario de 544 ejecuciones originales](2026-10-27-tests.md): 329 de lógica y 215 de navegador, agrupadas en 460 casos distintos. Los perfiles de navegador se mantienen separados como ejecuciones; una prueba ejecutada en varios perfiles no es por sí sola redundante. La continuación documentada el 30 de octubre ya comprendía 83 casos.

Se examinó el resto del inventario por archivo y caso, leyendo escenarios, entradas, aserciones y efectos, y se conservaron los casos que cubren condiciones o capas distintas. Se revisaron también las pruebas posteriores identificadas en los archivos actuales. Ninguna se ha eliminado por semejanza de nombre o código. El inventario enlazado contiene el detalle de cada caso original; los títulos y el listado actual pueden obtenerse con `npm test` y `npm run test:browser -- --list`.

## Mejoras

- Análisis y patrimonio: los cambios del PR #61 refuerzan rentabilidades numéricas, aportación neta, fechas inválidas, objetivos, previsión, cartera vacía, horizontes desconocidos y preservación de métricas.
- Precios: el PR #62 refuerza selección sobredimensionada, productos afectados por fallos parciales, conservación de cotizaciones, UUID e intentos de recuperación y previsualización de histórico. El título de migración refleja las hojas realmente verificadas.
- Seguridad y conexión: comprobar la presencia efectiva de lecturas antes de verificar que se dirigen al libro previsto; exigir ausencia de lecturas para usuarios no autorizados.
- Operaciones y cola: comparar el estado completo tras rechazar un lote, comprobar revisión obsoleta y todos los campos de la corrección de nómina, y conservar la solicitud pendiente cuando no se obtiene el bloqueo.
- Cartera: impedir que los controles universales pasen con listas vacías y que una comparación numérica acepte `null` por coerción.
- Navegador: exigir un recibo reproducido al reintentar una compra, además de confirmar que no se duplican registros.

Las comprobaciones locales y la integración continua deben asociarse al commit concreto examinado. Los tests usan datos y servicios ficticios: no validan por sí solos la instalación privada de Google ni sustituyen una revisión visual o de dispositivo físico. La ejecución de la batería no prueba ausencia de fallos ni cobertura completa.
