# Corte B2B con ofertas vigentes

- Al actualizar o revisar un nuevo corte se compara el producto comercial con
  `b2b_mejor_oferta`: menor costo publicado vigente, con proveedor y producto activos.
- Se usa el precio retail de esa oferta; se excluyen borradores. “Vigente” no
  significa que la lista tenga fecha de hoy: su fecha real sigue en el historial.
- La vista previa identifica cambios frente al pedido enviado por la tienda.
  El pedido, su precio original y su fuente no se reescriben.
- La confirmación valida la huella dentro del mismo bloqueo que el publicador de
  listas. Si cambian pedidos, precios o proveedores se exige revisar nuevamente.
- El corte confirmado conserva oferta, lista, proveedor, costo, precio retail y
  datos originales como copia histórica. Publicar otra lista no lo recalcula.
- Compras y recepción, su CSV y la validación de nuevas órdenes usan la copia del
  cierre. Los cortes históricos siguen siendo compatibles. Una excepción de costo
  o precio requiere nota; no se cambia de proveedor silenciosamente.
- No se recalculan líneas que ya tengan compras creadas. El cierre no crea órdenes,
  inventario, remisiones, deuda, caja ni banco: solo consolida y encola el correo.
- Esta migración cambia funciones, sin modificar pedidos, ofertas o cierres previos.

Pruebas: `node --test tests/erp/b2b-corte-ofertas-vigentes.test.mjs`.
