# Clasificación de inventario — 12 de septiembre de 2026

Compras exigía siempre `serializado` al crear referencias. Ahora exige seleccionar cantidad (sin IMEI) o control individual por IMEI/serial; la categoría no fuerza el tipo. La regla es compartida, no depende de una tienda.

Con autorización de Óscar se corrigió 5CM1002, XIAOMI SOUND PARTY 50W, a cantidad. No se fusionó con 5GE7015. Su factura es FEC22734: no confundir con el reporte de FEC227531.

La corrección se probó primero en transacción con rollback y luego se ejecutó atómicamente, bloqueando remisión y producto. Se exigió remisión #38 despachada, revisión 0, una sola unidad sin IMEI en traslado, dos movimientos originales y ausencia de stock por cantidad. Las claves foráneas impiden eliminar una unidad con otros usos.

Se preservaron ítem, factura, movimientos y margen: cantidad 1, costo 255000, precio de remisión 294000. Se retiró únicamente la unidad provisional sin IMEI, desvinculándola del margen. Se creó lote por cantidad con saldo CENTRAL 0 porque ya está despachado. La recepción sigue pendiente y utilizará el flujo por cantidad. La revisión pasó a 1 para exigir recargar antes de recibir.

El estado anterior completo, incluida la unidad retirada, y el resultado están en `kora_private.correcciones_tipo_inventario`, con fecha, ejecutor técnico y motivo de autorización. No se atribuyó la ejecución a Mayte. Tabla privada con RLS y sin acceso público. No se tocaron pagos, saldos ni cartera.

Verificación posterior: tipo cantidad, cero unidades serializadas, CENTRAL cero, remisión despachada sin fecha de recepción, margen intacto, una entrada de auditoría. Suite oficial: 486 pruebas aprobadas.
