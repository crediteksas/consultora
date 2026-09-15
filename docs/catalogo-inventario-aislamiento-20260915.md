# Catálogo e inventario por tienda — 15 de septiembre de 2026

## Hallazgo y cambio

El catálogo retail consultaba todos los productos activos y después agregaba el costo propio. Esto mostraba referencias generales con costo pendiente: no probaba exposición de cantidades de otras tiendas.

Ahora consulta `catalogo_tienda_lectura`: solo productos activos con stock positivo o unidades disponibles de la tienda del perfil activo. La vista usa `security_invoker`, `security_barrier`, RLS de las tablas base y filtro explícito por `tienda_actual()`. No acepta una tienda arbitraria ni expone costo proveedor. El catálogo maestro de administración permanece separado. Los precios mínimo/máximo son únicamente los precios de remisión de existencias propias.

Inventario agrega filtros explícitos de tienda a las consultas y defensa en memoria. Una cuenta sin tienda asignada no consulta ni muestra inventario. Accesorios permite buscar por nombre/código, sin distinguir tildes, y ordena alfabéticamente, con orden numérico natural.

No se modificaron cantidades, costos, remisiones, utilidades ni registros históricos. El control de conteos al corte permanece independiente.

## Verificación

- 565 pruebas locales aprobadas; cuatro pruebas SQL de la migración con diez tiendas sintéticas, productos compartidos, usuarios sin tienda/inactivos, permisos anónimos y columnas restringidas.
- Prueba Chrome con las pantallas reales y datos sintéticos mezclados: ninguna fila ajena renderizada, consultas filtradas por tienda, búsqueda, orden y fallo cerrado sin tienda.
- Auditoría de solo lectura en producción antes y después, usando el rol `authenticated` y los 12 perfiles activos de las diez tiendas: **cero filas ajenas** en catálogo, stock por cantidad y unidades. Consultas sin filtro de tienda del cliente.
- Móvil Shopping, Creditel Coveñas, Kredisinu, Creditel Chinú, Celfiao Tolú, Creditel Store, Celfiao, Orocel, Chinucell y Sonivox cubiertas. Coveñas retornó cero existencias, no se generó inventario para llenar ese resultado.
- Migración aplicada en producción: `20260915174605_catalogo_inventario_por_tienda`.
- Asesor de seguridad sin hallazgos sobre la nueva vista. Persisten avisos ajenos a esta modificación; esta revisión no certifica todos los endpoints de la aplicación.

Prueba de navegador: `node tests/erp/catalogo-inventario.browser.mjs`.
Pruebas generales: `npm run test:local`.
