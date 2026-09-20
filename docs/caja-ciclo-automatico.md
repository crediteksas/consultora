# Corte automático y arqueo de apertura

Alcance autorizado: separar el informe nocturno de ventas del arqueo físico; exigir la conciliación anterior antes de nuevas operaciones de caja; permitir gastos atrasados antes del arqueo; conservar aprobaciones y trazabilidad.

- El corte no crea efectivo contado ni diferencia cero ficticios.
- Se mantiene el horario existente: 19:00 Colombia; domingos/festivos, 15:00.
- Los cierres anteriores a la activación no se reescriben ni se validan automáticamente.
- La validación se impone en base de datos, además del aviso de pantalla.
- Ventas, gastos y caja se envían independientemente; un fallo no impide intentar los demás.
- Un gasto pendiente de aprobación no queda aprobado por registrar un arqueo.
- El efectivo por cobrar de créditos no es efectivo de caja.

## Activación y operación

La migración aplicada el 20/09/2026 fija `fecha_inicio=2026-09-21`. Los cuatro cierres ya realizados el día 20 se conservan bajo el flujo anterior. Primera validación obligatoria: mañana del 22/09, correspondiente al día 21.

Ruta tienda: Mi tienda → Caja → Validación del efectivo anterior. Registrar primero los gastos atrasados con su fecha, esperar aprobaciones pendientes y registrar el conteo físico. Si difiere, queda observada; no se altera el conteo para forzar cero. Gestión/Gerencia revisa la misma sección, conserva el importe contado y autoriza la diferencia con motivo si corresponde.

El corte se genera con el envío programado, no bloquea ventas de esa misma noche. Una consulta matinal recupera el estado pendiente aunque el programador haya fallado. Las operaciones posteriores al informe aparecen en la consulta actualizada y en el arqueo; no se reenvía silenciosamente un informe ya confirmado.

Los mensajes largos se dividen solo cuando no caben completos en una plantilla. Se conserva la confirmación de cada destinatario y parte. Aceptación por Meta no acredita entrega o lectura por WhatsApp.

## Controles y evidencia

- 13 casos SQL aislados: arrastres sin doble descuento, días sin cierre, permisos, fechas, gastos pendientes/rechazados, diferencias, idempotencia, registros abiertos e inmutabilidad.
- 107 pruebas del Worker y verificación TypeScript.
- Suite local de seguridad/regresión y prueba Chrome con datos sintéticos en 390 y 1280 px.
- Los 25 registros de `caja_diaria` conservaron exactamente su huella `6addee5fe61bca9fb1ecf8f3a0fd813d` antes y después de aplicar la migración.
- No se crearon arqueos ni conteos de prueba en producción.

La apertura histórica declarada sigue siendo el ancla: esto no certifica dinero físico anterior ni corrige inventando importes los saldos esperados negativos. Estos requieren revisión de Gestión.

El asesor de seguridad también reporta advertencias previas ajenas al cambio (funciones antiguas, extensión pública y protección de contraseñas). No se modificaron en esta implementación. Las nuevas RPC internas no están disponibles para clientes; las RPC de usuarios comprueban perfil activo, rol y tienda.
