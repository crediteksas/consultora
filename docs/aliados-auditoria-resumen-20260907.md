# Auditoría y resumen de liquidaciones

- Auditoría consulta los usuarios por separado; no presupone una relación PostgREST entre audit_log.usuario y perfiles. Conserva los eventos si no puede leer un nombre.
- Dashboard: bonificaciones del periodo y consulta de histórico cerrado plegada; se eliminan tarjetas históricas redundantes.
- Reportes: una utilidad de Creditek y su resultado después de gastos. No se incorporan costos ni margen de inventario Retail.
- Ciudad: origen o sede vinculada por código, sin inferirla por nombre ni tomar la ciudad de otro local. Las ciudades ausentes requieren datos reales.
- Comparación de PayJoy: los ejemplos aprobados consultados usan monto_base por porcentaje. La operación del 6 de septiembre conserva su utilidad de 175.440. No se modificaron importes ni políticas; existe una discrepancia de etiqueta base_field en el snapshot que no autoriza recalcular el histórico.
- Krediya: verificado el selector por fecha real de venta en Bogotá y la conservación de tarifas anteriores. No se cambiaron precios.

Validación: 363 pruebas locales aprobadas. Render de reportes comprobado con fixture y CSS real en 1280 y 390 px. No constituye una prueba de sesión autenticada. No se aprobaron lotes ni se registraron pagos.
