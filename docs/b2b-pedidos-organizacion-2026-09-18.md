# Pedidos y abastecimiento: organización por tareas

## Cambio

- Cuatro vistas excluyentes: Listas y precios, Catálogo de tiendas, Pedidos y cierre, Compras y recepción. Se conserva el estado del editor al cambiar de vista.
- Listas guardadas visibles al entrar, última versión de cada proveedor; búsqueda, conteos y accesos a dudas/excluidos. Los encabezados no cuentan como productos excluidos.
- Descarga comparativa visible; oportunidades de margen como revisión manual opcional.
- Editor con búsqueda, filtros y 20 referencias por página. Datos desplegables y acciones de guardar/publicar antes de los resultados.
- Lista publicada en solo lectura hasta preparar una actualización. Navegar y abrir listas no escribe datos.
- El catálogo vacío distingue listas cargadas de publicaciones y enlaza a lo guardado, sin pedir volver a cargar la información.
- Se mantienen los enlaces antiguos por hash; navegación con teclado, foco, controles con contraste y distribución móvil.

## Fuente y límites

La navegación por tareas recupera el patrón comprobado en `creditek/portal/index.html` de Aura. No se presenta esta mejora como recuperación completa de su automatización ni resolución de las referencias aún pendientes. No se modifican reglas de precio, equivalencias, exclusiones, fotografías, ofertas, compras o pedidos de producción durante la revisión visual.

## Verificación

- Regresiones incorporadas al pipeline `test:local`: navegación, resumen paginado y errores de consulta, editor/lectura publicada, oportunidades y apertura sin mutaciones.
- Prueba visual local con datos simulados a ancho normal y 390 px. Corregidos solapamientos de filas móviles y filtros comprimidos.
- `npm test` general incluye deuda de suites antiguas de AURA/ERP y pruebas externas; no es la suite aprobada de despliegue. `test:local` mantiene su selección documentada y añade todos los tests de esta entrega.
- Abrir las pestañas y consultar listas se valida también en producción después del despliegue; sin guardar ni publicar precios reales.
