# Seguridad

Esta política describe los límites del código del repositorio para la entrega 3.8.1, API 3.3.0 y modelo 3. La revisión y las pruebas no garantizan ausencia de vulnerabilidades desconocidas ni verifican automáticamente el código instalado en una implementación privada de Google.

## Reportar una vulnerabilidad

Si GitHub tiene habilitada la opción de reporte privado en **Security → Report a vulnerability**, utilízala para enviar el hallazgo al repositorio. Esta documentación no presupone que esa opción esté habilitada. Si no aparece, solicita al responsable del repositorio un canal privado mediante un issue que solo pida ese canal, sin publicar detalles de explotación ni datos sensibles. No hay una dirección de correo de seguridad configurada en este documento.

Incluye la versión o commit afectado, componente, impacto esperado y pasos reproducibles con datos ficticios. Describe si el fallo ocurre en pruebas locales o en una implementación privada, sin compartir su URL, IDs de libros, identidad del propietario, credenciales, recibos, sobres ni copias financieras. No pruebes contra cuentas o libros ajenos.

## Modelo de amenazas y controles

La app pública de GitHub Pages no contiene el libro ni ofrece una API HTTP pública de escritura. El acceso financiero depende de una sesión autorizada de Google y del backend privado de Apps Script. Los controles relevantes del código son:

- **Acceso y escrituras:** el servidor comprueba la cuenta propietaria antes de acceder a Sheets, tanto en la API como en las funciones públicas del editor. El servidor selecciona el libro configurado; acepta procesos y campos concretos, no instrucciones arbitrarias de celda. El texto se escribe como `stringValue`, no como fórmula.
- **Canal entre ventanas:** Bridge valida origen, ventana y referencia de sesión. El cliente acepta respuestas del marco y origen exactos del saludo autenticado. El cambio de implementación invalida la conexión anterior.
- **Contenido y fuentes externas:** la interfaz utiliza `textContent` para los datos del libro y no ejecuta HTML del proveedor. La CSP pública restringe scripts y recursos a los permitidos; los estilos en línea de instalación y vista previa se autorizan por huella. Los errores internos no se devuelven al navegador. Las cotizaciones consultan rutas HTTPS fijas con ISIN validado y sin seguir redirecciones.
- **Integridad de operaciones:** revisión, vínculo de libro, UUID y journal permiten detectar conflictos y recuperar recibos. Una escritura sin respuesta confirmada se conserva como incierta y requiere consultar su recibo antes de reintentar el mismo sobre.
- **Dependencias y publicación:** CI comprueba formato, lint, pruebas y vulnerabilidades conocidas altas o críticas. Las dependencias están fijadas en el lockfile y las acciones por commit completo. Superar estas comprobaciones no acredita que una dependencia carezca de fallos desconocidos.

Las reglas de identidad, clase, divisa y fecha efectiva de las cotizaciones y sus límites históricos se documentan en [PRICES.md](apps-script/PRICES.md). No se debe sustituir una fuente fallida por un dato inventado, interpolado o retrospectivo.

## Datos locales y límites de alojamiento

IndexedDB conserva lectura y pendientes para la recuperación local. La app no cifra estos datos. La cola para agentes guarda información financiera en archivos del usuario con escritura atómica y sincronización a disco; no es un almacén de credenciales. El service worker cachea recursos públicos de la app, no lecturas financieras ni respuestas privadas de Google.

Utiliza un dispositivo, perfil de navegador y cuenta de Google de confianza. Antes de borrar la copia local desde **Ajustes → Almacenamiento local**, resuelve los pendientes; la app bloquea el borrado cuando quedan operaciones pendientes. Preserva colas y journal al investigar una respuesta incierta.

Los proyectos alojados bajo `manuuelmarin.github.io` comparten la frontera de confianza del mismo origen. No publiques código ajeno o sin revisar bajo ese origen. La CSP mediante etiqueta meta no configura `frame-ancestors` ni sustituye las cabeceras HTTP de un alojamiento propio. La app incrustada restringe configuración y operaciones; para operar, ábrela en su propia ventana.

Los controles del repositorio no protegen frente a un dispositivo, cuenta de Google, cuenta de GitHub o código del mismo origen comprometidos. Antes del uso real, verifica la implementación exacta instalada, el acceso **Solo yo** y el rechazo de otra cuenta. Las pruebas locales usan servicios y datos simulados; no sustituyen esas comprobaciones.

## Cambios e incidentes

Mantén `ENVIRONMENT=test` mientras no exista una instrucción expresa de corte. Publicar Pages no cambia libros, propiedades privadas, permisos ni triggers de Apps Script. Las modificaciones de autenticación, CSP, Bridge, PWA y permisos requieren revisar su efecto sobre esta frontera de confianza, sin desactivar controles para resolver un problema de conexión.

Si sospechas un incidente, detén los envíos y conserva los archivos, colas y recibos necesarios para investigar en un entorno privado. Revisa las cuentas y la implementación afectadas antes de continuar. Una restauración debe reconciliar operaciones por su journal y recibos; no deduplicar solo por concepto e importe. Las copias nativas de Sheets no respaldan las propiedades ni los despliegues de Apps Script.
