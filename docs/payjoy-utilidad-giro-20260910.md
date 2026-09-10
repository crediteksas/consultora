# Corrección PayJoy: utilidad después del giro

Gerencia confirmó: recibimos 800.000, PAGAMOS 616.000, inicial 120.000,
giro 496.000, bonos 25.000, utilidad 279.000.

Aplicada en producción KORA (jfkmiyvcdfbsbwchyvol) exclusivamente a cinco
operaciones del lote cargado el 10 de septiembre, ventas del 9 de septiembre.
Utilidad total anterior 1.035.008; corregida 1.776.208.
Se preservan PAGAMOS, pago neto, bonos, soportes, autorizaciones, estado y cierre.
La migración verifica huellas de todas las órdenes, ítems y bonos; registra
los valores anteriores completos en audit_log. No ejecuta recálculo del lote.

La fórmula corregida aplica a nuevos lotes PayJoy creados desde 2026-09-10
00:00 America/Bogota. No cambia fórmulas ALO/Krediya ni recalcula históricos.
No se cambiaron etiquetas ni políticas de porcentaje en este ajuste numérico.

Prueba PGlite: node --test tests/erp/payjoy-utilidad-giro.test.mjs (PASS).
Verificación remota: cinco filas corregidas, ejemplo 279.000 y total 1.776.208.
Huella de operaciones fuera del lote idéntica antes/después:
4c351c0bc0901677aafe48a6ccc99f26.

Revisión posterior solicitada: 57 operaciones en 12 lotes anteriores,
ventas 2026-08-24 a 2026-09-08, difieren de la regla confirmada.
No se modificaron: contienen lotes pagados/cerrados que requieren ajuste
auditable de utilidad sin reabrir pagos ni declarar nuevamente disponible
la utilidad ya retirada. Esta revisión no cubre otras tablas históricas.
