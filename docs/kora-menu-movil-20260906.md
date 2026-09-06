# Menú móvil KORA · 6 de septiembre de 2026

## Causa y corrección

La regla móvil que oculta la barra cuando `data-sidebar-collapsed="true"`
tenía mayor especificidad que la regla de apertura `data-open="true"`.
Con la preferencia predeterminada `auto`, el fondo se activaba pero el menú
permanecía fuera de pantalla. Se reprodujo con el shell real en Chrome.

- El estado abierto del drawer ahora prevalece también con escritorio colapsado.
- Al cruzar el breakpoint de 1024 px se cierra el drawer y su fondo, conservando
  la preferencia de escritorio. Se actualizan el botón y la marca.
- El cierre devuelve el foco al botón principal también en Safari.
- CSS compartido versionado como `kora-shell.css?v=2.0.6`.
- Sin cambios en datos, roles, permisos, liquidaciones o pagos.

## Verificación

- `npm run test:local`: 246 pruebas aprobadas, incluida la nueva regresión.
- Pruebas específicas de navegación, iconos y responsive: 16 aprobadas.
- `node --test tests/e2e/kora-mobile-navigation-local.test.mjs`: Chrome.
- La misma prueba con `KORA_TEST_BROWSER=webkit`: WebKit 26 / motor Safari.
- Ambas preferencias (`auto` y `pinned`), anchos 320, 390, 430, 768, 1023 px
  y transición a escritorio de 1440 px.
- Apertura visible sobre el fondo, expansión de secciones, acceso al enlace de
  Liquidaciones, cierre por botón, fondo y Escape, sin desborde horizontal.
- Fixture con perfil ficticio, activos reales y conexiones externas bloqueadas;
  no utiliza una sesión ni consulta la base de datos.

La prueba WebKit utiliza un navegador temporal en `/private/tmp/kora-mobile-playwright`.
No es una ejecución en un iPhone físico.

## Publicación

Usar exclusivamente `npm run deploy:kora:production` desde el repositorio
autorizado y con el commit limpio. Comprobar el manifiesto runtime y los hashes
de `sidebar.js` y `kora-shell.css` frente al artefacto antes de dar el despliegue
por terminado. El servidor exige revalidar el JavaScript al recargar.
