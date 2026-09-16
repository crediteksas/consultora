# Reportes nocturnos ordenados — 11 de septiembre de 2026

Alcance: los tres informes automáticos (ventas, gastos y cierre de caja) del
Worker `creditek-clientes`. No cambia consultas financieras, destinatarios,
horarios, permisos, cierres, pagos ni importes. No afecta el Worker de Sofía.

## Causa y solución

Las plantillas anteriores contienen un solo parámetro. El envío sustituye los
saltos de línea por puntos medios porque Meta no admite esos saltos dentro de
los parámetros. Cambiar únicamente el texto del reporte no resuelve el problema.

Se crearon variantes `reporte_cierre_ordenado_1_v2` hasta
`reporte_cierre_ordenado_8_v2` en la cuenta WhatsApp **Creditek SAS**
(`27206918652305029`), categoría Utilidad, idioma `es_CO`.
La fuente exacta del cuerpo fijo es `cuerpoPlantillaReporte` en
`creditek/workers/creditek-clientes/src/reportes-formato.ts`.

- Parámetro 1: título, fecha y parte cuando corresponda.
- Parámetros siguientes: una fila de tienda/movimiento, alerta o total cada uno.
- Las separaciones entre filas están en el cuerpo fijo aprobado, no en parámetros.
- Se elige el tamaño exacto, sin filas vacías ni tiendas inventadas.
- Los informes extensos continúan en partes numeradas, sin truncar sus importes.
- Gastos se ordena por tienda; cada concepto conserva su valor y descripción.
- Las tiendas pendientes de cierre aparecen separadas, no en una lista pegada.

## Entrega y activación

La opción `REPORTES_FORMATO_ORDENADO=true` habilita el nuevo formato. Sin ella
continúan usándose las tres plantillas anteriores.

Estado comprobado el 16 de septiembre: las ocho variantes están activas en
`es_CO` y conservan el cuerpo aprobado. La opción quedó habilitada en la
configuración productiva del Worker. Los reportes presentan primero su resumen
y total; luego separan cada tienda y, en gastos, cada movimiento.

Se guarda confirmación por tipo de reporte, destinatario y parte. La primera
confirmación conserva la composición del informe para reintentos. Los reportes
ya enviados con el formato anterior no se reenvían al activar el cambio.
No cambiar de formato durante una entrega parcial; el código evita enviar el
informe anterior encima de páginas nuevas ya confirmadas.

Este Worker tiene configuración independiente: usar explícitamente
`--config ./wrangler.toml` desde `creditek/workers/creditek-clientes`.
No desplegar la aplicación KORA para actualizar estos reportes.

## Verificaciones

- `npm run typecheck`.
- `npm test`: pruebas de separación, todas las filas y totales, texto largo,
  informes sin movimientos, conservación del envío anterior y reintentos parciales.
- `wrangler deploy --config ./wrangler.toml --dry-run`.
- Antes de activar: revisión de estado y vista previa en Meta.
- Después: comprobar la versión desplegada y sus bindings. No disparar un cierre
  real ni enviar mensajes de prueba a destinatarios sin una solicitud del usuario.
