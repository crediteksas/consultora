# Conciliación de correo y revisión de Addi

## Alcance y resultado

Cuenta revisada: comercial@crediteksas.com. Correos disponibles al 7 de septiembre de 2026. Se revisaron 142 adjuntos PayJoy/ALO (incluidas versiones corregidas), conservando una copia por nombre en la búsqueda anterior a agosto. Esto acredita cobertura de los archivos revisados, no de créditos que no estén en el correo.

| Plataforma | Créditos únicos contrastados | Incorporados al histórico | Faltantes al finalizar |
| --- | ---: | ---: | ---: |
| PayJoy | 703 | 7 | 0 |
| ALO Credit | 389 | 10 | 0 |

Cruce por plataforma e identificador contra `creditos_historicos_plataforma` y `liquidation_operations`. Verificación adicional por IMEI para los 10 ALO nuevos, sin coincidencias. No se sobrescribieron créditos existentes. Los ocho IMEI ausentes en una versión ALO no reemplazaron la información de versiones completas.

PayJoy: siete ventas del 31 de agosto, reporte `20323-D-20260901.xlsx`, correo `1a05cb7f5c40e020`. ALO: ocho ventas del 20–23 de abril en `al del 20 al 26 abril 2026.xlsx` y dos del 16 de junio en `ALO TER  DEL 15 AL 21 JUNIO 2026.xlsx`.

## Salvaguardas de la carga

- INSERT únicamente en la tabla histórica existente, sin triggers de usuario.
- Conflicto por plataforma/código: DO NOTHING; exclusión de créditos ya presentes en liquidaciones.
- Estado `consulta`, `requiere_soporte=false`, procedencia y filas originales en `datos_origen`; `modo_importacion=solo_consulta`, `no_generar_pagos=true`.
- No se marcaron pagados, no se calcularon utilidades ni bonos históricos y no se ejecutaron funciones de aprobación o pago.
- Fechas de venta preservadas; fechas sin hora de ALO almacenadas a medianoche de Bogotá. Fecha de correo y nombre del reporte separados.
- Huellas de todas las filas, ordenadas por ID, idénticas antes y después:
  - payment_orders: `ee2e10bd1fd36173dd4d2449755c090c`
  - liquidation_bonuses: `90c654a3b5ff0a57060ed5da52c3c543`
  - liquidation_operations: `ffc555b93ff4f5eab2c7bc452191bbdc`
  - liquidations: `f7fbc5c065de07c08b8fc418531eda45`

## Addi: fuente comprobada y decisión pendiente

Correo de Mayte `1a06d95d38df53eb`, asunto `addi`, 4 de septiembre: archivo original `CO_creditecksastiendas-online_L_2026-08-20_969304.xlsx` y `como lo liquido addi.xlsx`. También revisados `ADII A AGOSTO 11.xlsx` y `ADDI A AGOSTO 9 2026.xlsx`. Fórmulas verificadas en los XLSX originales, no solo en valores extraídos.

Ejemplo original: venta 916.300; comisión Addi −68.722,50 (7,5%); IVA −13.057,28; neto Addi 834.520,22. Fecha de venta 20 de agosto y fecha de pago reportada 4 de septiembre son conceptos distintos. Esta tasa observada no es una autorización para fijarla globalmente.

En `como lo liquido addi.xlsx`, hoja `Transacciones + cancelaciones`, AH7 = AE7 × AH5; AH5 = 90%. AI7 = AE7 − AH7. Pago a tienda sin redondear: 751.068,198; margen de Creditek: 83.452,022. El costo del equipo no participa en ese margen.

En `ADII A AGOSTO 11.xlsx` la misma hoja usa AH5 = 85%; AH7 = AE7 × AH5 − AK7. AK7/AK8 están vacíos. No interpretar ese término como un descuento autorizado. En `ADDI A AGOSTO 9 2026.xlsx` se observa 90% y una hoja `pago` que resta inicial; hay que mantener separada cualquier inicial efectivamente documentada.

No activar una regla general hasta confirmar porcentaje aplicable, alcance por tienda y vigencia por fecha de venta. Falta también acordar precisión/redondeo de pagos. No se activó Addi ni se crearon pagos de sus ejemplos.

### Inconsistencias de archivos que el importador debe reportar

- `como lo liquido addi.xlsx`: el total de pie en Resumen Total conserva 1.631.300 y 1.485.706,47, aunque el único crédito detallado es 916.300 y 834.520,22.
- `ADII A AGOSTO 11.xlsx`: resumen conserva reportes anteriores; el detalle tiene dos créditos. Varias sumas terminan en fila 7 y excluyen fila 8, mientras AE10 sí suma ambas.
- No tomar totales copiados como créditos ni inferir pagos ejecutados de fechas programadas o del texto de un correo.

### Requisitos de integración, todavía no implementados

1. Leer filas de transacción por ID de operación/crédito, nunca los totales de resumen como operaciones.
2. Dedupe por plataforma/ID; conservar cancelaciones y ajustes como movimientos relacionados.
3. Mantener importes de venta, tarifas, impuestos, descuentos, anticipos, neto Addi y pago a tienda separados, respetando signos y centavos de origen.
4. Aplicar la política interna vigente por fecha de venta, con snapshot; no inventar 85% o 90%.
5. Separar margen Creditek de utilidad Retail basada en costo de inventario.
6. Para histórico, consulta únicamente, sin crear aprobaciones, bonos u órdenes de pago.

La carga histórica está aplicada en producción. No hubo cambios de aplicación ni despliegue en esta revisión; Addi requiere la decisión anterior antes de implementarse para pagos.
