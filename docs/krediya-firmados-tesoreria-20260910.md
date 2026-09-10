# Créditos finalizados y pago pendiente

Regla aclarada por Gerencia el 10 de septiembre de 2026:

- FIRMADO + solicitud Aprobado + pago PENDIENTE es elegible para liquidación.
- Se conserva FIRMADO + PAGADO; estados desconocidos no se habilitan.
- ANULADO/no finalizado queda excluido, con seguimiento; las anulaciones de
  operaciones previas mantienen conciliación y recuperación independientes.
- Aprobar liquidación no autoriza el pago individual ni registra un desembolso.

El fallo `total_operaciones null` ocurría porque preparar catálogo actualizaba
normalized_data y disparaba el control antiguo, excluyendo los 19 firmados.
Ahora el importador y el trigger comparten la regla. Se comprueba además que
queden filas elegibles después de preparar catálogo, sin falsear totales a cero.

La migración solo cambia funciones: no aprueba lotes, no recalcula históricos,
no modifica tarifas, bonos, pagos ni fuentes. El usuario conserva la aprobación.
Validación: 418 pruebas pasan, incluyendo 19 firmados + 2 anulados, actualización
del catálogo, suma correcta, lote vacío con error claro y control de duplicados.
Producción consultada: lote 2026-09-06, 19 reconocidos compatibles, 2 excluidos,
sin aprobación. No se ejecutó el RPC de revisión/aprobación sobre datos reales.
