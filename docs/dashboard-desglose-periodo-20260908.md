# Dashboard: periodo completo y desglose de utilidad

Consulta contrastada en KORA (jfkmiyvcdfbsbwchyvol), 8 septiembre 2026. Sin escrituras financieras.

## Krediya, aliados, agosto

Margen antes de deducciones: 4.448.310,00 COP.
Bonos: 1.100.000,00. Gasto financiero: 57.907,91.
Provisión: 921.312,60. Gastos operativos aprobados registrados: 0.
Resultado final: 2.369.089,49 COP.

El snapshot llama `utilidad_bruta` al resultado DESPUÉS de bonos y gasto financiero. No se usa ese rótulo como margen inicial. El informe reconstruye el margen desde resultado final más deducciones guardadas. No cambia la fórmula, las tarifas ni los bonos. La comisión operativa de referencia del histórico Krediya está incluida en su provisión: no se resta dos veces.

## Ventas de agosto

El dashboard quitaba las operaciones importadas antes del 1 de septiembre del resumen, aunque el filtro fuera por fecha de venta. Ahora combina operaciones con histórico por plataforma + identificador de crédito. La liquidación revisada prevalece sobre su copia histórica; no se duplica por IMEI ni se unen créditos entre financieras.

Agosto 1–31, solo aliados, consulta SQL deduplicada: PayJoy 78 / 70.828.000 COP; ALO 23 / 15.890.055 COP; Krediya 22 / 14.476.977 COP. Total 123 créditos. El filtro hasta agosto 30 excluye correctamente agosto 31.

Resultado final del periodo y resultado no cerrado son conceptos separados. El histórico cerrado no genera pagos ni saldo nuevo. Datos financieros incompletos se señalan como parciales. El gasto operativo mostrado comprende únicamente gastos aprobados registrados, no costos todavía sin registrar. Las provisiones calculadas no prueban reservas bancarias efectivas.

Pruebas: dashboard-desglose-periodo.test.mjs y dashboard-desglose-local.test.mjs, más pipeline local de KORA. ADDI permanece fuera del alcance.
