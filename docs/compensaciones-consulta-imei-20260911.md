# Consulta de compensaciones e IMEI de tienda

- Tesorería: pestaña «Compensaciones y movimientos de tiendas», separada de pagos.
- Rango inicial: hoy, por `created_at` convertido a America/Bogota, no por corte.
- Filtros combinables: fecha desde/hasta inclusiva, tienda, plataforma, IMEI parcial y valor exacto sin separadores de miles. «Consultar todo» elimina filtros y «Hoy» restaura el rango diario.
- Abonos y margen de Tercerización conservan tablas separadas. No se recalculan importes. La cartera visible sigue siendo el saldo actual completo.
- Historial de la tienda: IMEI obtenido por referencia exacta del abono y código de tienda. Si no está disponible se indica, sin ocultar importes ni inventar un equipo.
- Consulta RPC mínima: devuelve referencia, tienda e IMEI, nunca márgenes. No concede acceso directo a la tabla de Tesorería. Requiere sesión, perfil activo y rol central o admin de la misma tienda. Sin acceso anónimo.

## Verificación

- 434 pruebas locales aprobadas, incluidos límites de fecha Bogotá, filtro independiente de pagos, importes intactos y consulta diaria.
- Chrome local: ambas tablas dentro de la pestaña y fuera de las tarjetas de pagos; seis filtros.
- Consulta en producción bajo rol authenticated y perfil admin_tienda CK-02: seis resultados propios, cero de otras tiendas solicitando todas las referencias. Transacción revertida; sin movimientos financieros.
- Asesor de seguridad ejecutado. La función usa SECURITY DEFINER intencionalmente para consultar únicamente el IMEI, con autorización explícita por tienda y EXECUTE revocado de PUBLIC/anon. El aviso genérico para funciones autenticadas requiere esta revisión manual: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- No se alteraron saldos, compensaciones, aprobaciones, permisos de escritura ni registros históricos. Otros avisos del asesor ajenos a este cambio no se modificaron.
