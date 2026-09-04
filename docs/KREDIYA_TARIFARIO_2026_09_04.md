# Krediya: tarifario y diferencias

Fuente autorizada por Oscar: `PAGAMOS Y COSTOS DE EQUIPOS .xlsx`, Hoja1,
filas 2–53. PVP columna L; Pagamos columna N. El Excel original no se modifica.
SHA-256: `5af1c4d5cd0eea4b09f3d794bfc576e1fc74549cb0b828ffa5c5ea2eacfc1f68`.

Se cargan 52 referencias con vigencia desde el inicio operativo 2026-09-01.
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
anteriores al 1 de septiembre no reciben automáticamente tarifas retroactivas.

Verificación: pruebas unitarias del editor y fuente; prueba transaccional en
Postgres con rollback de conservación del original, precio efectivo, ausencia
de pagos nuevos y rechazo de precio inválido, congelados y acceso anónimo.
