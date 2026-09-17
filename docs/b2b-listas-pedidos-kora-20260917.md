# Listas de precios y pedidos dentro de KORA

## Alcance

Gerencia y Auditoría cargan Excel/CSV desde B2B → Pedidos y abastecimiento → Cargar lista de precios. Proveedores y cartera tiene un acceso al mismo panel. Los roles admin_tienda y asesor encuentran Mi tienda → Pedidos a Creditek.

La hoja y sus columnas se seleccionan antes de revisar. Se requiere costo real; nunca se reconstruye desde el precio de venta. Se conserva el precio final del archivo o su margen explícito; si faltan ambos, se propone costo + $20.000. Las excepciones requieren origen o motivo. Se vinculan referencias y proveedores existentes sin coincidencias aproximadas ni creación silenciosa de productos. Las filas sin datos, duplicadas o ambiguas bloquean la publicación salvo exclusión explícita. No se publican archivos truncados.

La publicación reemplaza las ofertas vigentes de los proveedores incluidos, o todo el catálogo si se selecciona ese alcance. La pantalla exige confirmación de ese reemplazo. Los originales normalizados, archivo, autor, fecha, costos y precios quedan conservados por versión. Por referencia se elige el menor costo proveedor; empate por menor precio retail y proveedor estable.

No se migran automáticamente precios del portal anterior: reconstruía el costo restando $20.000. Es necesaria una primera lista validada con costos reales. Tampoco se convierten productos del inventario de las tiendas en catálogo comprable automáticamente.

## Seguridad y pedidos

- Listas, ofertas y fuentes de abastecimiento: RLS solo Gerencia/Auditoría activas, sin permisos de escritura directos.
- El RPC del catálogo proyecta solo identificador de referencia, nombre, código, categoría, foto, precio retail y versión opaca. Solo perfiles activos y tiendas propias activas.
- El servidor fija la tienda del perfil y valida versión/precio publicado, cantidad y duplicados. No acepta precios arbitrarios desde el navegador.
- Una clave por intento evita duplicar pedidos al reintentar. Pedido e ítems se guardan atómicamente. La fuente privada conserva proveedor y costo de la versión original aunque cambie la lista.
- Órdenes de compra bloquean y validan cantidades pendientes. Cambios de costo/precio requieren nota. La descarga CSV incluye pedidos pendientes, tiendas, referencias, proveedores, cantidades, costos y precios; las celdas se protegen contra fórmulas inyectadas.
- No se envían los pedidos nuevos al Google Apps Script heredado. El portal antiguo no se modifica en este trabajo.
- Cargar listas y enviar pedidos no toca inventario, facturas, cartera ni caja. Recepción de compras y remisiones conservan su flujo existente.

## Verificación

Pruebas PostgreSQL local (PGlite): roles, RLS, mejor costo, excepciones, costos inaccesibles a tiendas, anonimato, perfil inactivo, precio manipulado, precio desactualizado, duplicados, cantidades, idempotencia, congelación de costo y precio, órdenes parciales sin sobrerreserva.

Prueba de navegador local con datos simulados: Gerencia, Auditoría, administrador de tienda y asesor; archivo CSV real leído por SheetJS; revisión antes de publicar; precio final y costo independientes; pedido sin datos de proveedor; pantalla móvil sin desbordamiento. No se crearon pedidos ni precios reales durante estas pruebas.
