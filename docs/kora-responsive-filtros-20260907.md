# Reflow transversal de filtros

Corrección de la capa compartida cargada por el shell KORA (39 pantallas): toolbar, filters, filtros, filter-bar y filter-row se reorganizan según el ancho disponible, sin comprimir sus controles a 145 px en escritorio. Las métricas compartidas usan columnas adaptables y valores alineados. En móvil se elimina el doble margen main/page y se reduce el espacio interior de filtros.

Verificación: prueba aislada con los estilos reales y sus importaciones, cinco clases de contenedor en seis anchos (320, 390, 768, 1024, 1280 y 1920 px). Se comprueba ancho de texto de los siete filtros del caso reportado y ausencia de desborde horizontal. No es una auditoría funcional autenticada de todas las pantallas ni garantiza que cualquier nombre arbitrariamente largo quepa en un select nativo.

Ejecutar: `node tests/e2e/kora-filter-reflow-check.mjs` (Chrome instalado). Las capturas de prueba se guardan en /tmp. No se consultan datos de negocio ni se modifican cálculos, cuentas, pagos o permisos.
