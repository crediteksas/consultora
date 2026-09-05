# Krediya: tarifario y diferencias

Fuente autorizada por Oscar: `PAGAMOS Y COSTOS DE EQUIPOS .xlsx`, Hoja1,
filas 2–53. PVP columna L; Pagamos columna N. El Excel original no se modifica.
SHA-256: `5af1c4d5cd0eea4b09f3d794bfc576e1fc74549cb0b828ffa5c5ea2eacfc1f68`.

Se cargan 52 referencias. La vigencia inicial 2026-09-01 se corrigió hasta
2026-08-12, primera venta del lote pendiente para el que Oscar entregó el archivo.
El corte operativo del informe no determina la vigencia del tarifario.
Cada regla conserva en auditoría archivo, huella y celdas de origen. No se
sobrescriben reglas existentes ni liquidaciones aprobadas. La referencia se
normaliza únicamente en espacios, puntuación y mayúsculas; no se fusionan
capacidades, RAM o nombres diferentes que comparten código de modelo.

El editor sustituye el prompt USAR/CORREGIR/ERROR y presenta PVP y Pagamos
guardados, recibidos y diferencia. Permite aceptar el PVP recibido, conservar
la tarifa o corregir exclusivamente el crédito. Muestra utilidad bruta,
provisión del 28% y neta, sin inventar bonos cuya vigencia no esté definida.
No altera el archivo fuente ni el tarifario maestro y no autoriza pagos.

Los precios coincidentes y bonos vigentes se concilian al abrir una liquidación
editable. Las diferencias reales permanecen pendientes de decisión. Las ventas
del lote pendiente de agosto también reconocen la fuente entregada. La reparación
de vigencia no recalcula ni modifica operaciones aprobadas.

Verificación: pruebas unitarias del editor y fuente; prueba transaccional en
Postgres con rollback de conservación del original, precio efectivo, ausencia
de pagos nuevos y rechazo de precio inválido, congelados y acceso anónimo.

Regla de cálculo confirmada: PVP = columna L, nunca Precio Sug (G).
Pagamos = columna N antes de inicial. Giro al aliado = Pagamos − inicial.
Utilidad bruta = PVP − Pagamos − $20.000 de bonos; provisión = bruta × 28%.
La inicial no se descuenta otra vez de la utilidad. Si el importe reportado por
Krediya difiere del PVP, se muestra la comparación sin adoptar ese importe.
