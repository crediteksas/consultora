# Corrección visual acotada de Sofía — 28 octubre de 2026

## Publicado y verificado — 28/10/2026, 7:03 p. m. Colombia

La URL real de AURA se sirve mediante dos capas: `creditek-aura` conserva sus assets y `creditek-aura-shell` atiende las rutas de la interfaz. Las rutas de la zona confirmaron que los ajustes debían aplicarse al segundo. No se cambió ninguna ruta, permiso ni archivo estático.

La versión final del shell es `b8d08dc5-d051-4dee-a09b-69de009fece9` al 100%. Su nuevo módulo `sofia-ui.mjs` (SHA-256 `b3328fc1e61cfd2e573c89b39e5c7da3c88466a30ce716dd5d85ea4d06c980b1`) envuelve los tres módulos anteriores sin cambiar un byte de ellos. Corrige el HTML en su URL original y desactiva el módulo de dictado que cargan el padre y los iframes.

El Worker de archivos quedó con la fuente original `81dddfb9d550de148cffecd83d4524c12b3b32ff219c7b521525cdb8969a3b72`, versión `02910609-a8c1-45a2-bf7c-9b6ac164cec4`. Su bundle, configuración y conexiones se conservaron. Los parches intermedios de ese Worker se retiraron; no se utiliza la ruta alternativa exploratoria.

Verificaciones finales: 9 pruebas relacionadas (shell real, reescritura HTML y dictado), integridad de los módulos y scripts operativos, páginas ajenas sin cambios, API sin sesión sigue en 403, Sofía y NOVA sin modificaciones por este despliegue. Las respuestas cortas de Sofía se publicaron por separado, con 191 pruebas aprobadas. Sin mensajes a clientes ni pruebas pagadas.

Revisión visual autenticada terminada el 28/10/2026 a las 8:21 p. m. Colombia, después de que Oscar inició sesión. Se comprobó la URL original dentro de AURA: encabezado e indicadores sin solapes, filtros legibles, búsqueda funcional y ausencia del dictado tanto al enfocar la búsqueda como el campo de respuesta. Solo se abrió la conversación de prueba de Oscar; no se escribió ni envió ningún mensaje. Captura privada: `/tmp/sofia-ui-revision-20261028.jpg`. La demostración grabada para Meta sigue pendiente.

Fuente de la publicación final: `shell.mjs`, `shell.test.mjs` y `release-shell.mjs`. Evidencia: `shell-verification.json`. Respaldos privados en `backups/aura-sofia-layout-20261028/shell/`. Los scripts previos de esta carpeta documentan intentos y pruebas históricas; no son el procedimiento de publicación final.

El encabezado conservaba 56px de altura, mientras la capa común aumentaba botones y campos a 44px y el responsive movía los indicadores a otra fila. Esto provocaba el título comprimido y solapes. El filtro de canal también compartía una columna insuficiente.

La corrección agrega una capa CSS exclusiva de `body[data-aura-page="sofia"]`: título/acciones en una fila, seis indicadores en otra y filtros largos a ancho completo. En celular se distribuyen los indicadores en dos filas. El título identifica el espacio como «Sofía · Conversaciones» sin afirmar que los canales están habilitados para atención general.

La capa se aplica únicamente al HTML de Sofía, tanto en la URL `.html` como en su ruta canónica sin extensión. No cambia JavaScript operativo, sesiones, permisos, registros, APIs, directorio, WhatsApp ni Instagram. La publicación reutiliza el conjunto de assets vigente completo con `keep_assets:true`; no sustituye la aplicación por un checkout antiguo. La fuente anterior completa se conserva y solo cambia el export para envolverla con el ajuste.

Pruebas: cuatro verificaciones con HTMLRewriter real en Miniflare, sintaxis del Worker reconstruido y capturas de la vista a 1136, 768 y 390px con datos ficticios y scripts operativos desactivados. No se enviaron mensajes ni consultas de crédito.

Fuente inicial: SHA-256 `81dddfb9d550de148cffecd83d4524c12b3b32ff219c7b521525cdb8969a3b72`. Respaldo privado no versionado: `backups/aura-sofia-layout-20261028/predecessor.mjs`. La guardia rechaza otra fuente productiva. Conservar el respaldo para reconstruir; no desplegar el build estático histórico de AURA-MOBILE.
