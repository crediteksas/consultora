# ALO: conciliación de fórmula con referencias de Oscar

Referencia: archivos ALO TIENDA y ALO TER DEL 24 AL 30 AGOSTO 2026, hoja Worksheet.
TIENDA: 5 operaciones, U2:Y6, porcentaje V17 (76%). TER: 7 operaciones,
U2:AD8, porcentaje V16 (77%). Los originales permanecen sin cambios.

## Fórmula confirmada

- Valor comercial = crédito financiado + inicial.
- PAGAMOS = valor comercial × porcentaje vigente del tipo de establecimiento.
- Giro neto = PAGAMOS − inicial.
- Utilidad = crédito financiado − giro neto − bonos vigentes.
- Comprobación: giro + bonos + utilidad = crédito financiado.

Las políticas de bonos existentes no cambian. Los bonos históricos de los Excel
son valores de referencia para probar las fórmulas, no nuevas políticas.

La versión previa del motor ALO multiplicaba crédito financiado por porcentaje
y calculaba utilidad como crédito − PAGAMOS − bonos. Ambas expresiones diferían
del Excel. PayJoy y Krediya quedan intactos por no estar documentados por estos archivos.

## Controles reproducibles

Las 12 filas del Excel están en tests/erp/calculo-antes-tesoreria.test.mjs.
SQL ejecutado en PGlite verifica PAGAMOS, giro, bonos, utilidad, totales y repetición
del cálculo. TIENDA: giro 2.071.250, utilidad 847.800. TER: giro 3.563.700,
bonos de referencia 215.000, utilidad 1.282.300. Diferencia: cero en las 12 filas.
El dominio JS también descuenta la inicial una sola vez al calcular utilidad ALO.

## Créditos repetidos

El importador ALO serializa importaciones y compara por contrato dentro de ALO,
independientemente de fechas de informe, corte o venta. Si el contrato está en
un lote no anulado, conserva el registro anterior y omite el repetido. Incluye
borradores para evitar dos pagos futuros; muestra el estado anterior real y no
afirma que un borrador esté pagado. Contratos sin identificador requieren corregir
el origen para poder asegurar identidad. Las filas originales quedan conservadas.
Si cambian importe, inicial o IMEI, el informe señala la diferencia sin sobrescribir
el crédito previo. Un lote anulado permite reimportar. El control no borra históricos.

El detalle ALO muestra el informe de contratos omitidos, respaldado por audit_log.
La fecha de venta sigue determinando vigencia de tarifa; no se reemplaza por corte.

## Alcance operativo

Al revisar producción, el único lote ALO era 0908b010-88b9-437f-ac91-711d39e571d7,
corte 2026-09-06, seis operaciones, calculado y no aprobado. Ninguno de los 12 IMEI
de referencia coincidía con una operación ALO registrada: la comparación es de
fórmula, no una afirmación de que son las mismas ventas. No importar estos archivos
como parte del arreglo, no aprobar pagos, no cambiar bonos, no reabrir históricos.
