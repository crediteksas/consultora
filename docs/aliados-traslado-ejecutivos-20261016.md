# Traslado de clientes de Yeimi a Luis · 16/10/2026

Cambio de datos maestros autorizado expresamente por Gerencia y aplicado en
producción el 16/10/2026. Auditoría de KORA: registro **2832**.

- Los 7 comercios de Yeimi y sus 7 fichas de aliados quedaron asignados a Luis.
  Se actualizaron ambos maestros, `origenes` y `aliados`, sin duplicar clientes.
- La política de pagos de Luis se conserva sin modificaciones.
- Alex conserva su bono fijo de $30.000 por crédito. Se registró en su nota la
  instrucción de no sumar otros $30.000 por primera venta. Ese adicional no
  estaba automatizado; no se eliminó el bono fijo ni se cambió el calculador.
- No se reasignaron créditos anteriores ni se recalcularon bonos o liquidaciones
  ya registradas. Las tablas históricas se comprobaron sin cambios dentro de la
  misma transacción. No se modificaron saldos, caja ni banco.
- Se guardaron los valores anteriores en auditoría y se emitió `ally.updated`
  para cada ficha, indicando autorización, motivo y alcance.

Verificación posterior: 7/7 comercios y 7/7 fichas a nombre de Luis, ninguno
restante a nombre de Yeimi; políticas de Luis y Alex conservadas.

Este commit documenta una operación de datos ya aplicada. No contiene datos
personales, respaldos de clientes ni una migración para repetir el traslado.
No cambió código, funciones SQL o esquema, por lo que no requiere un nuevo
despliegue del Worker. El respaldo detallado permanece en auditoría y en el
artefacto privado de la tarea.
