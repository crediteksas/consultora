# Pedidos B2B sin selección de color

Autorización: Óscar indicó el 18/09/2026 que los colores no son relevantes para la compra y no deben aparecer en el pedido.

## Alcance

- 14 grupos verificados reúnen 42 productos que sólo difieren por color en 14 referencias comerciales. Otros 14 productos conservan identidad propia, con una etiqueta de pedido sin color.
- Catálogo publicado: 335 → 307 referencias visibles. Se conservan las 488 ofertas originales de los cinco proveedores.
- No se renombran ni borran productos, imágenes, SKUs, listas, equivalencias aprendidas, ofertas, inventario ni movimientos. Los IDs comerciales del pedido apuntan a productos ya existentes.
- La tabla `b2b_referencias_catalogo` contiene sólo equivalencias y nombres públicos, sin costos. Cada grupo tiene una raíz explícita, sin cadenas ni ciclos.
- Se compara el costo de todas las ofertas activas del grupo. Por proveedor se muestra su menor costo; el desempate usa precio retail, proveedor e ID de oferta. La oferta original queda vinculada en `b2b_pedido_fuente`.
- El precio retail registrado de la oferta elegida se conserva. No se recalcula IVA ni se cambia la política de márgenes.
- El catálogo, carrito, consulta de pedidos, órdenes PDF, recepción y CSV usan el nombre sin color. Los avisos de pedidos y nuevos cierres usan el mismo nombre; los cierres históricos no se reescriben.
- Fotografías ilustrativas: no se promete ni se selecciona color. Las listas del proveedor conservan el texto original para edición y trazabilidad.

## Diferencias que permanecen separadas

RAM, almacenamiento, red, generación, región eléctrica, edición/material, correa y accesorios incluidos. En particular, Smart Band 10 Ceramic Edition no se une a la estándar; Watch S4/S5 conserva diferencias de materiales y dotación, sin mostrar el color. Air Fryer US no se une a la ficha genérica sin confirmar región eléctrica.

Las variantes y nombres exactos están en `tests/fixtures/b2b-colores-20260918.json`. La migración resuelve códigos de catálogo, valida nombres originales y falla si la fuente cambió, en lugar de inferir una equivalencia.

## Verificación

- PGlite: agrupación, ganador real entre proveedores/colores, edición cerámica separada, compra con referencia canónica y fuente de color, conservación de precios históricos, `Bajo pedido`, acceso retail/anon/inactivo, rechazo de IDs de colores antiguos y bloqueo de ciclos.
- Producción: 56 mapeos, 307 ganadores, 488 ofertas activas, cero ganadores distintos del menor costo. Hashes de productos y ofertas idénticos antes/después; pedidos, fuentes, órdenes y cierres sin alteraciones.
- El ajuste no crea pedidos, compras, correos de prueba ni movimientos en producción.

## Reversión

Restaurar la versión anterior del frontend y las definiciones anteriores de `b2b_mejor_oferta`, `catalogo_pedidos_b2b`, `kora_claim_b2b_pedido_mail` y `vista_previa_cierre_b2b`. La tabla nueva puede permanecer sin usarse; no hay datos fuente que restaurar. La migración sólo agrega el mapa y cambia modelos de lectura; no modifica el motor de recepción ni las fórmulas.
