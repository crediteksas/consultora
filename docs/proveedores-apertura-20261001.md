# Proveedores: instrucciones de apertura del 1 de octubre de 2026

Fuente: instrucciones de Óscar en este chat y respuestas remitidas de Maythe del 1 de octubre, 15:23 (Colombia). Son saldos auditados de partida, no solicitudes de reconstruir toda la operación anterior. Este documento no es una aprobación ejecutada en KORA ni un comprobante de pago.

## Saldos confirmados

| Proveedor en KORA | Nuevo saldo neto a proveedor (COP) | Tratamiento confirmado |
| --- | ---: | --- |
| LEGO YANET | 19.850.500 | No retención |
| CORBETA | 10.523.854 | No retención |
| CONMOVIL | 0 | Los 389.043 informados son retención histórica, no deuda con el proveedor |
| COMUNICARIBE | 1.283.885 | Ya incluye la retención; no descontar otra vez |
| INITY | 0 | Retención futura 2,5 % |
| MUNDO NET CEL | 24.204.111 | No retención |
| MR MOVIL SAS | 11.267.385 | Respetar el saldo comunicado; retención futura 2,5 % |
| TEKMOBILE | 8.072.500 | Sustituye el dato inicial de 8.072.475 |
| J ACEVEDO | 14.940.000 | No retención |

Total de estos nueve saldos: **90.142.235 COP**. No incluye Calvo Cell ni MPS; COMQUIA se omite por instrucción expresa (saldo cero, no crear un proveedor artificial).

TEKMOBILE: 11.700.000 − 292.500 de retención − 3.335.000 de abono = 8.072.500. KORA conserva un pago histórico diferente: no borrarlo ni transformarlo silenciosamente en un movimiento bancario. La corrección se identifica como ajuste de apertura con autorización y trazabilidad.

Los saldos no deben aplicarse sin considerar movimientos nuevos entre la auditoría y la solicitud. La preparación consulta las facturas actuales; la aprobación compara nuevamente todo el detalle. Si cambió, rechazar la solicitud y preparar otra después de revisar la nueva operación.

## Retenciones y pronto pago

- Futuro 2,5 % sobre subtotal sin IVA: CONMOVIL, COMUNICARIBE, COMQUIA (cuando exista), INITY, MR MOVIL SAS y TEKMOBILE.
- Sin retención según la instrucción: LEGO YANET, CORBETA, MUNDO NET CEL, J ACEVEDO y MPS.
- Excepción posterior indicada por Óscar: **CALVO CELL sin retención por ahora (0 %), hasta nueva instrucción**, conservando el descuento por pronto pago. No extender la excepción a otros proveedores ni revertir retenciones históricas.
- Los demás proveedores no tienen una regla confirmada aquí; no asumir cero ni 2,5 %.
- Conservar separado el importe retenido, la base, porcentaje y factura/proveedor. No descontar de nuevo retenciones incluidas en los saldos de apertura.
- Los 389.043 de CONMOVIL y los 292.500 de TEKMOBILE son importes históricos informados. No prueban por sí solos declaración o pago de impuestos; tampoco permiten repartir CONMOVIL entre facturas sin soporte.
- CALVO CELL: saldo bruto confirmado 3.450.507; **retención 0 % y descuento condicionado de 5 % sobre el subtotal antes de IVA**. Esta es la instrucción vigente de Óscar y sustituye, solo para este proveedor, el 2,5 % indicado anteriormente. La base y el porcentaje del descuento no cambian.
- Plazo comercial comunicado: 25 días; vencimiento de las facturas actuales comunicado por Maythe: **2 de octubre de 2026**. Última instrucción de Óscar: **hay que pagar hoy, 1 de octubre de 2026**, para aprovechar el descuento. Ese es el límite operativo indicado para este pago; no se cambia por ello el vencimiento original ni se inventa una nueva condición para futuras facturas.
- **Dato necesario para el importe exacto**: subtotal antes de IVA de las facturas actuales. KORA no contiene esa base separada; no deducirla de los costos ni asumir que 3.450.507 es el subtotal, ni dividir todo por 1,19 sin el desglose. Mantener separados retención, descuento y dinero a girar; no dar por ganado el descuento antes del pago que cumpla las condiciones.

### Comprobación de Calvo Cell después de confirmar la base del descuento

Consulta de solo lectura y revisión visual de los tres soportes enlazados en KORA, 1 de octubre de 2026. Son remisiones manuscritas: no muestran IVA separado. No hubo aprobación, pago, ajuste ni cambio de vencimiento.

| Documento | Total escrito en soporte | Total/saldo en KORA | KORA menos soporte |
| --- | ---: | ---: | ---: |
| REM 0420 | 2.012.000 | 2.012.000 | 0 |
| REM 0423 | 801.000 | 800.996 | -4 |
| REM 0424 | 637.500 | 637.511 | +11 |
| Total | 3.450.500 | 3.450.507 | +7 |

KORA registra cero pagos en los tres documentos. El saldo confirmado por Óscar sigue siendo 3.450.507; la diferencia de 7 pesos se informa, no se corrige sin autorización. Las remisiones muestran fechas de agosto (28, 29 y 31), mientras KORA registra fecha 7 de septiembre y vencimiento 30 de septiembre; las fechas tampoco se modifican a partir de esta inspección. Para programar este pago prevalece la instrucción operativa de pagar hoy; no se presupone qué fecha originó el plazo comercial.

Archivos de soporte comprobados en Storage, bucket `productos-fotos`:

- `compras/REM_0420_1789418007320.jpeg`
- `compras/rem_0423_1789425671824.jpeg`
- `compras/rem_0424_1789421118577.jpeg`

La regla de los porcentajes ya quedó aclarada; falta el **importe base real**: confirmar si los 3.450.507 comunicados son antes de IVA o proporcionar el desglose fiscal. No tomar la ausencia de una línea de IVA en una remisión como prueba de que no existe IVA.

## Alcance de la entrega

Administración → Ajustes de Gerencia → Deuda con proveedor. Maite prepara, Óscar decide. Las reducciones proponen las facturas más antiguas primero y muestran el reparto para aprobación; los aumentos generan un documento `ajuste_gerencia` de total de compra cero, sin mercancía, con la diferencia trazada. Ninguno crea pagos ni movimientos de Banco/Caja.

Esta entrega habilita la preparación y autorización de ajustes: **la migración no modifica los saldos reales ni aplica automáticamente los valores de este documento**. La aplicación automática y el libro de retenciones futuras no están implementados en esta migración; requieren completar las entradas fiscales de los flujos de compra directa y compra desde pedido. El descuento condicionado tampoco se ha aplicado.
