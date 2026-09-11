# Conciliación Retail tardía — 2026-09-11

La ausencia de venta/inventario Retail no bloquea liquidar una operación de plataforma ni su compensación de cartera. Se conserva la novedad abierta, por IMEI y operación. IMEI duplicado, tienda distinta y diferencias de inicial mantienen sus controles existentes.

La migración modifica únicamente los dos diagnósticos del resolutor y las novedades abiertas de tiendas propias en lotes no aprobados. No recalcula, cambia fechas, registra ventas, aprueba lotes, autoriza pagos ni crea abonos. Los abonos conservan la protección existente por operation_id en tesoreria_generar_destinos_liquidacion.

Verificación en producción: PayJoy corte 2026-09-10 continúa revisada sin aprobación guardada, pasa de un bloqueo abierto a cero; conserva cuatro órdenes y cero compensaciones. Corresponde al gerente aprobar el lote existente, no volver a calcularlo.

452 pruebas locales aprobadas. Migración aplicada en Supabase; no cambia el frontend y no requiere publicar Worker.

Alcance pendiente: esta corrección no añade una bandeja nueva de Retail ni un cruce automático posterior sobre lotes congelados. Las novedades permanecen en el registro existente hasta implementar ese flujo de seguimiento; no se consideran resueltas por quitar el bloqueo.
