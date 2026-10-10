# Contribuir a Finanzas

Gracias por contribuir. El proyecto mantiene una app PWA pública y un backend privado de Google Apps Script. La entrega actual es 3.8.1, con API 3.3.0 y modelo 3. Los cambios de documentación o mantenimiento del repositorio no deben alterar operaciones, autenticación, permisos, colas ni versiones por sí solos.

## Preparar el entorno

Necesitas Node.js **24 o superior** y npm. CI utiliza Node 24 en Ubuntu. Desde la raíz:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
```

El segundo comando instala Chromium y las dependencias de sistema que usa CI en Ubuntu; estas últimas pueden requerir permisos del sistema. Si ya tienes las dependencias de Chromium disponibles, `npx playwright install chromium` instala solo el navegador. No hacen falta credenciales ni un libro real para las pruebas locales.

Consulta [Desarrollo](docs/DEVELOPMENT.md) para el mapa del código, los comandos y las herramientas para agentes; [Arquitectura](docs/ARCHITECTURE.md) para los límites entre componentes; y [Seguridad](SECURITY.md) para el manejo de datos y los reportes privados.

## Preparar un cambio

1. Parte de `main` y trabaja en una rama con un nombre descriptivo.
2. Limita el cambio al objetivo del issue o PR y conserva los contratos existentes. Utiliza datos ficticios en ejemplos, fixtures y capturas.
3. Edita los archivos fuente. `web/install.html` y `web/sw.js` son generados: no modifiques sus bloques a mano; regenera con `npm run build`. La CSP de las páginas públicas también se genera durante el build.
4. Aplica Prettier y ejecuta las comprobaciones antes de abrir el PR.
5. Describe el comportamiento o documento que cambia, las comprobaciones realizadas y sus límites. Si afecta a fuentes de NAV, indica identidad, clase, moneda, fecha efectiva y alcance histórico verificados, siguiendo [Cotizaciones](apps-script/PRICES.md).

El formato se mantiene con Prettier para JavaScript, CommonJS, Apps Script (`.gs`, parser Babel), HTML, CSS, JSON, Markdown y YAML. Usa `npm run format` para el repositorio o `npx prettier --write ruta/al/archivo` para un cambio concreto. ESLint comprueba `.js`, `.cjs` y `.gs`. El repositorio no contiene código Python; Black no forma parte de sus herramientas de calidad.

```sh
npm run build
npm run format:check
npm run lint
npm test
npm run test:browser
npm run audit
```

`npm run check` agrupa build, formato, lint y ambas suites de pruebas. La auditoría de dependencias se ejecuta aparte. CI bloquea la publicación si falla cualquiera de estas comprobaciones; las pruebas simuladas no acreditan una instalación privada de Google ni un teléfono físico.

## Commits

Los asuntos nuevos deben cumplir la regla de `tools/check-commits.cjs`:

```text
tipo(scope opcional)! opcional: descripción
```

Tipos permitidos: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`, `style`, `revert`. El scope, si existe, contiene uno o más caracteres de `a-z`, `0-9`, `.`, `/`, `_` o `-`. Puede añadirse `!` justo antes de `:`. Tras `: `, la descripción ocupa entre 5 y 100 caracteres. Ejemplos:

```text
docs: documentar el entorno de desarrollo
fix(queue): recuperar el recibo antes de reintentar
ci(quality): comprobar el formato de los commits
```

Para comprobar los commits desde la base de tu rama:

```sh
node tools/check-commits.cjs "$(git merge-base origin/main HEAD)" HEAD
```

La base debe ser un SHA completo de 40 caracteres hexadecimales en minúscula. La revisión final admite un SHA completo o `HEAD`.

## Privacidad y alcance

No incluyas IDs de libros, valores de `OWNER_EMAIL`, URLs privadas de implementación, credenciales, recibos, sobres reales, capturas con datos personales ni copias financieras en commits, issues o PRs. Los archivos de cola y los informes de una ejecución con datos reales también pueden contener información privada. Sustitúyelos por ejemplos ficticios y revisa el diff antes de publicar.

Mantén `ENVIRONMENT=test` y la separación entre libros e implementaciones. Un PR no autoriza activar producción, ejecutar operaciones de prueba en libros reales, reinstalar Apps Script ni cambiar permisos de Google o PWA. El despliegue de Pages solo publica los recursos de `web/`; no administra el proyecto privado de Google. Los procedimientos de instalación continúan en el [instalador](https://manuuelmarin.github.io/finances/install.html).

Para una vulnerabilidad, sigue [SECURITY.md](SECURITY.md) y evita un issue público con datos sensibles.
