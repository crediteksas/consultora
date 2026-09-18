# Pedidos: funciones del portal anterior frente a KORA

Revisión del 18 de septiembre de 2026. Fuentes: `creditek/portal/index.html`, `creditek/portal/Code.gs`, `creditek/erp/pedidos-b2b.html`, migraciones B2B y función de correo. Se inspeccionó código; no se creó ni cerró un pedido real ni se envió correo durante las pruebas.

## Recuperado en este cambio

| Función anterior | Implementación en KORA |
| --- | --- |
| Cerrar período y enviar consolidado | Pedidos y cierre → Revisar y cerrar período → confirmación. Copia permanente y correo en cola a Gestión y Comercial. |
| Resumen de pedidos, unidades y costo | Indicadores del período sin cerrar, también valor retail. No interpreta costo faltante como cero. |
| Pedidos por tienda y ciudad | Selector por proveedor, ciudad o tienda; referencias, cantidades, destinos y valores originales. |
| Archivo y consulta de cierres | Historial de cierres nuevos de KORA con descarga CSV de la copia guardada. No se borra el pedido. |
| Filtro por marca | Recuperado para las tiendas, con clasificación por nombre como en el portal anterior. No altera datos maestros. |
| Referencias disponibles y cantidad de pedidos | Conteo de referencias filtradas, unidades en carrito e historial con unidades y total retail. |
| Confirmación de pedido y acceso al historial | Confirmación persistente con número de pedido y enlace a Mis pedidos. |
| Navegación de administración | Accesos superiores a Pedidos y cierre, Precios y catálogo y Órdenes de compra. |

## Ya existía en KORA y se conserva

- Catálogo publicado, búsqueda y categorías, fotos que estén vinculadas al producto, carrito y precios de venta a tienda.
- Usuario autenticado vinculado a su tienda; no permite elegir arbitrariamente otra tienda.
- Pedidos, precios/proveedor congelados al solicitar y avisos individuales por correo.
- Carga Excel/CSV, listas WhatsApp, borradores, memoria por proveedor, márgenes excepcionales y comparativo descargable.
- Órdenes de compra, factura/soporte, recepción y remisiones. El cierre de período NO reemplaza esos procesos.

## Pendientes detectados: no presentar la migración como terminada

1. **WhatsApp a la tienda.** El portal tiene `enviarConfirmacionWA_` y estado de WhatsApp en historial. KORA no tiene ese envío de pedidos integrado. El código antiguo refiere una plantilla `test_variable`; es necesario confirmar plantilla vigente/aprobada, credenciales del canal y correspondencia de teléfonos por tienda antes de activarlo. No reutilizar una plantilla de prueba ni enviar mensajes de prueba a tiendas reales.
2. **Historial anterior de Google Sheets.** Los pedidos y cierres anteriores no están importados en `pedidos_b2b`. Al revisar producción había cero pedidos nuevos en esa tabla. Requiere localizar el archivo original, cruzar números de pedido, destinos y estados, y migrar sin generar avisos retroactivos ni duplicar compras. No confundir una pantalla vacía de KORA con ausencia de historia comercial.
3. **Fotos y fichas técnicas heredadas.** El portal carga `creditek/data/catalogo.json` y `creditek/assets/imagenes`, con pantalla, RAM/almacenamiento, cámara, batería y red. KORA usa `productos.foto_url`, pero no importa automáticamente ese enriquecimiento. Pendiente vincularlo al producto exacto: no usar el antiguo fallback que elimina PRO/PLUS/RAM y puede asociar una variante equivocada.
4. **Catálogo listo para pedir.** Las cinco listas nuevas siguen en borrador, con referencias por vincular y filas excluidas. El botón de comparativo permite verlas, pero eso no equivale a tenerlas publicadas para los retails.
5. **Matriz Excel antigua.** KORA admite Excel/CSV con mapeo, no la lectura fija de columnas T/U/W del portal. La rutina anterior reconstruía costo restando $20.000 al precio de venta: NO se recupera ese cálculo porque contradice la política vigente de costo real más margen. Una importación simplificada de esa matriz debe usar su columna de costo real comprobada.

## Controles del cierre

- Administración (Gerencia/Auditoría) únicamente; costos y consolidado no accesibles a tiendas.
- Revisión y confirmación explícitas; no cierre automático al consultar, descargar o desplegar.
- Idempotencia por solicitud, exclusión de pedidos previamente consolidados y bloqueo transaccional entre operadores.
- La confirmación incluye exactamente los pedidos revisados; los nuevos quedan para el siguiente corte.
- Copia de referencias, tienda/ciudad, proveedor, cantidades y precios al cerrar.
- Estados de correo pendiente/enviando/enviado/error/incierto. Un envío incierto no se reintenta automáticamente para evitar duplicados.
- No modifica fórmulas, precios, estado de compra/recepción, inventario ni cartera.

## Verificación

- Pruebas de base de datos local (PGlite), cuentas de Gerencia/Auditoría/tiendas y correo simulado, sin datos ni mensajes productivos.
- Cierres repetidos, pedidos recibidos después de la revisión, fuente sin costo, precios históricos y permisos denegados.
- El envío real a buzones no se prueba porque no se autorizaron correos de prueba ni existen pedidos reales en este flujo.
