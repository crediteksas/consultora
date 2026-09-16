# Meico: corrección de proveedor a cliente

Corrección autorizada expresamente por Óscar el 16/09/2026 y aplicada en una transacción atómica.

- Cliente existente: Meico (CK-14), cuenta `9bf23ec6-be05-4ea3-b857-1c44af54ab49`.
- Saldo inicial trasladado: $7.380.000, corte conservado 11/09/2026.
- Compras previas: $1.110.000 (remisión #21 por $959.700 y ajuste por $150.300), intactas.
- Nuevo saldo por cobrar: $8.490.000. No se registró ningún pago.
- Movimiento inicial nuevo: `103dc5e8-45ed-46de-a069-d0570ae33ac1`.
- Factura errónea retirada: `92342af0-ae60-44ab-b4f8-33e0c4f2e467`, SALDO-INICIAL-20260911.
- Proveedor erróneo MEICO desactivado, no eliminado.
- Auditoría 1065 conserva la factura completa, proveedor original, destino, saldos y autorización. Auditoría original 894 conservada.
- Soporte original verificado existente en el bucket `soportes`; no se borró ni reemplazó.

Antes del traslado se verificaron importe, fecha, identidad, cuenta destino, movimientos existentes y ausencia de referencias a la factura o actividad adicional del proveedor. Se bloquearon las filas afectadas. Cualquier discrepancia abortaba toda la transacción. Los movimientos de cliente anteriores no se modificaron.

La consulta de cartera ahora solicita `referencia_tipo` y `referencia_id`, y presenta la fecha de corte de los saldos iniciales de clientes. No se cambió ninguna fórmula. Prueba de regresión: inicial $7.380.000 + cargos $1.110.000 = saldo $8.490.000; el mes siguiente arrastra ese saldo sin duplicarlo.
