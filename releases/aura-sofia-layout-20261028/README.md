# Corrección visual acotada de Sofía — 28 octubre de 2026

El encabezado conservaba 56px de altura, mientras la capa común aumentaba botones y campos a 44px y el responsive movía los indicadores a otra fila. Esto provocaba el título comprimido y solapes. El filtro de canal también compartía una columna insuficiente.

La corrección agrega una capa CSS exclusiva de `body[data-aura-page="sofia"]`: título/acciones en una fila, seis indicadores en otra y filtros largos a ancho completo. En celular se distribuyen los indicadores en dos filas. El título identifica el espacio como «Sofía · Conversaciones» sin afirmar que los canales están habilitados para atención general.

La capa se aplica únicamente al HTML de Sofía, tanto en la URL `.html` como en su ruta canónica sin extensión. No cambia JavaScript operativo, sesiones, permisos, registros, APIs, directorio, WhatsApp ni Instagram. La publicación reutiliza el conjunto de assets vigente completo con `keep_assets:true`; no sustituye la aplicación por un checkout antiguo. La fuente anterior completa se conserva y solo cambia el export para envolverla con el ajuste.

Pruebas: cuatro verificaciones con HTMLRewriter real en Miniflare, sintaxis del Worker reconstruido y capturas de la vista a 1136, 768 y 390px con datos ficticios y scripts operativos desactivados. No se enviaron mensajes ni consultas de crédito.

Fuente inicial: SHA-256 `81dddfb9d550de148cffecd83d4524c12b3b32ff219c7b521525cdb8969a3b72`. Respaldo privado no versionado: `backups/aura-sofia-layout-20261028/predecessor.mjs`. La guardia rechaza otra fuente productiva. Conservar el respaldo para reconstruir; no desplegar el build estático histórico de AURA-MOBILE.
