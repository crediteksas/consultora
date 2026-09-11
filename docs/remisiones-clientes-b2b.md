# Remisiones a cartera B2B

Destinos existentes: Óscar CK-12, Luis CK-13 y Meico CK-14. Conservan tres cuentas separadas en Cartera B2B. No se crean tiendas ni se alteran saldos anteriores.

Desde Bodega Central, seleccionar el cliente marcado «Cartera sin inventario», elegir productos y confirmar el precio de remisión. Maite/Gerencia confirma el cargo inmediato. El asignador existente descuenta unidades/lotes de CENTRAL y conserva factura, costos y márgenes. Se carga un débito en movimientos_cartera por el total de la remisión.

Estado final: cartera_b2b. Las unidades quedan en salida_b2b como evidencia histórica; no se crea stock del cliente, no se pide IMEI ni aceptación. La deuda del proveedor permanece intacta. Los documentos y listado identifican el estado financiero. No se permite editar por la ruta de corrección previa a recepción una remisión ya cargada.

El request_id bloqueado transaccionalmente evita duplicar un reintento; con la misma clave y diferente contenido se rechaza. El UI conserva la clave ante error. Un nuevo despacho independiente requiere revisar que no exista ya la remisión.

Verificación: 453 pruebas locales, incluyendo permisos, reintento, cuenta independiente, falta de stock y preservación de factura. Migración aplicada sin despachar mercancía real ni registrar cargos de prueba. Los tres equipos de Óscar deben ser remisionados por Maite.
