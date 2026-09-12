# Control de inventarios autorizado por Gerencia · 12 de septiembre de 2026

## Reglas

- Retirar las nuevas cargas iniciales, incluidas plantilla, importación y finalización. Conservar íntegros inventarios y movimientos históricos.
- Las entradas normales se originan en compra y remisión de Central, aceptada por la tienda. No volver a comprar ni remisionar inventarios iniciales ya registrados.
- Un único archivo para celulares y otros productos, asociado a un corte persistente de tienda, fecha y hora.
- Registrar cada conteo, incluso sin diferencias. Conciliar movimientos posteriores al corte para no confundir ventas o recepciones con faltantes.
- Subir un conteo no aplica ajustes. Solo Mayte u Óscar pueden originar el movimiento de ajuste, con permisos comprobados en servidor.
- Guardar responsable, fecha, tienda, motivo, soporte, corte, producto/IMEI, cantidad anterior, diferencia, cantidad posterior y valoración.
- Un sobrante no se clasifica automáticamente como ganancia ocasional; se documenta la causa.
- Informe descargable por rango de fechas, tienda y responsable, con conteos, diferencias y ajustes. Debe permitir revisar el año completo en diciembre sin truncar resultados.
- Los informes por fechas son un requisito transversal del sistema; no afirmar cobertura global sin verificar cada módulo.

## Estado de esta entrega

El retiro de los accesos de carga inicial está implementado. La migración `20260912144724` está aplicada en Supabase: las tres operaciones no son ejecutables por `anon`, `authenticated` ni `service_role`. No borra ni altera registros. Las 23 pruebas de inventario se incluyen en el pipeline obligatorio de producción (477 pruebas aprobadas antes del despliegue).

El Kardex existente registra movimientos y filtra por fechas, pero limita la consulta a 300 filas. No equivale al informe integral de conteos solicitado. El corte persistente, la conciliación de conteos, los permisos nominativos y el informe integral siguen pendientes de implementación y verificación.
