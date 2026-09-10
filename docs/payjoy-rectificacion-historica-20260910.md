# Rectificación histórica PayJoy — pendiente de aprobación de seguridad

Alcance contrastado en KORA producción jfkmiyvcdfbsbwchyvol:
- 57 operaciones, 12 lotes, ventas 2026-08-24 a 2026-09-08.
- Aumento derivado de utilidad: COP 8.269.440.
- Agosto cerrado: COP 2.762.765 se adicionan tanto a utilidad como a resultado cerrado; disponible continúa cero.
- Septiembre: COP 5.506.675 de diferencia. De estos, COP 4.591.675 corresponden a 33 comisiones ya contabilizadas: asiento interno adicional, conservando el movimiento original.
- El remanente COP 915.000 pertenece al lote del 1 de septiembre sin esos movimientos originales; no se inventa una acreditación de saldo.
- PAGAMOS, giros, bonos, soportes, autorizaciones, cuentas corrientes y 839 registros de la tabla histórica no cambian.
- 832 registros históricos completos ya coinciden con la regla; 7 permanecen sin fórmula histórica validada.

Pruebas: 12 PASS incluyendo migración PGlite, conservación de cierres, pagos y guardas; recuperación/anulación y reportes.
Las guardas se exceptúan exclusivamente en la transacción para columnas derivadas y se restauran antes de commit. No queda permiso nuevo ni función pública de rectificación.

La herramienta rechazó aplicar la migración por riesgo financiero de producción y alcance/implementación no suficientemente aprobados. NO se aplicó. Requiere aprobación explícita para los 57 ajustes y el asiento interno descritos. No intentar eludir el rechazo.

La corrección anterior del lote cargado hoy (commit 2faf998) sí permanece aplicada.
