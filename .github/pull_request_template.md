## Cambio

Describe el problema y el resultado observable de este PR.

## Alcance

Indica qué componentes cambian. Si es documentación o formato, confirma si los archivos de la app permanecen idénticos.

## Validación

- [ ] `npm run check` y `npm run audit` pasan, o se documenta qué comprobación no pudo ejecutarse y por qué.
- [ ] Los archivos generados coinciden con sus fuentes después de `npm run build`.
- [ ] Se conserva `ENVIRONMENT=test`; cualquier otro entorno requiere una decisión explícita fuera de este PR.
- [ ] El diff no contiene datos financieros, credenciales, identificadores de libros ni enlaces privados.
- [ ] Se han descrito las limitaciones relevantes y cualquier paso manual en Google.

GitHub Pages publica después de superar calidad. Un merge no instala Apps Script ni activa sus rutinas.
