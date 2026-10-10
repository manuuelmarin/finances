# Historial de cambios

Este documento resume las entregas descritas en el repositorio. Los números identifican la app y su código de Apps Script; no implican que existan tags o releases de GitHub. La API conserva su propio identificador, actualmente **3.3.0**.

## Mantenimiento del repositorio · sin nueva versión de la app

- README centrado en el producto, acceso y documentación vigente.
- Arquitectura, desarrollo y seguridad separados del historial de entregas.
- Plantillas de incidencias y PR; convenciones de edición y finales de línea uniformes.
- Se conservan los archivos ejecutables, dependencias y configuración de despliegue de la entrega 3.8.1.

## 3.8.1

[PR #14](https://github.com/manuuelmarin/finances/pull/14)

- Aportación neta como área azul bajo una escalera con base cero; valor de mercado como línea roja sin relleno ni puntos.
- Rentabilidad TWR entre valoraciones reales sin flujos intermedios. Si falta el histórico inicial, el tramo calculable muestra su fecha de inicio; un flujo sin valoración suficiente interrumpe el cálculo.
- Actualización diaria voluntaria en pruebas: un trigger horario consulta entre las 20 y 22 h de Madrid, con hasta tres intentos por lote y día.
- Protección concurrente, recuperación mediante recibos y comprobación del libro después de consultar la fuente.
- Ajustes muestra activación y última ejecución al releer el libro. Los precios atrasados o conflictivos no se presentan como una actualización completada.

## 3.8.0

- Resumen de patrimonio, composición y saldo del presupuesto global del mes.
- Tablas con filtros y ordenación por columna; gráficos con selección de series e inspección por fecha.
- Inversiones seleccionables por producto y periodo, con ISIN y fuente separados.
- Análisis de gastos por distribución y acumulados; exclusión explícita de categorías.
- Evolución diaria del efectivo, ahorro mensual sobre nómina y comparación de asignaciones con metas.
- Calculadoras de plazo hasta una meta, aportación necesaria y colchón de liquidez.
- Respaldo entre las dos fichas oficiales de VDOS/Quefondos y preparación de la rutina diaria voluntaria en pruebas.

## 3.7.0

- Pantallas propias para Resumen, Movimientos, Inversiones, Cuentas, Presupuestos, Salario, Objetivos, Actividad, Calculadoras y Ajustes.
- Navegación móvil, conservación de filtros y detalles de los registros.
- Pendientes e historial confirmado en Actividad; diagnósticos y almacenamiento en Ajustes.

## 3.6.1

- Reutilización de la sesión de Google entre lectura, comprobaciones y registro.
- Bloqueo de comprobaciones duplicadas y descarte de respuestas de una configuración anterior.
- Avisos de conexión en español y recuperación de la ventana cerrada.

## 3.6.0

- Primera lectura completa en el HTML privado de Google después de comprobar la identidad propietaria.
- Verificación del canal autenticado antes de anunciar la conexión.
- Transporte JSON para lecturas posteriores y operaciones; distinción entre lectura fallida y escritura sin confirmar.

## 3.5.1

- Recuperación de respuestas inciertas con el mismo UUID y consulta del recibo antes de reintentar.
- Protección de operaciones inciertas frente a edición o descarte.
- Cancelación de lecturas antiguas al cambiar la implementación.

## 3.5.0

- Alta de movimientos desde la carga del libro, con accesos por tipo de operación.
- Panel con gráficos y presupuestos mensuales globales o por subcategoría.
- Límites auditados sin crear movimientos ni alterar el efectivo.

## 3.4.0

- Comprobación de cierre sobre estructura, cálculos, resumen, Bridge, fuentes y estabilidad de la revisión.
- Preparación del principal con configuración explícita y distinta de pruebas.
- Mantenimiento de API 3.3.0 y controles de vínculo de libro, revisión y recibos.

La instalación privada de Google y el entorno operativo no se deducen de este historial. Se comprueban en la implementación conectada; publicar GitHub Pages no los modifica.
