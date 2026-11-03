# Agenda de cartera: primera etapa operativa

Agenda con filtros de prioridades de hoy, datos incompletos, sin gestión y todos los abiertos; compromisos, historial por cliente y general, exportación CSV del filtro visible. Lectura paginada de gestiones con los permisos existentes. Registro de gestiones y promesas mediante RPC existente; fecha y valor requeridos para promesa. No se modifican obligaciones, estados de mora, pagos, saldos ni permisos.

Las promesas vencidas piden verificar cumplimiento. Los datos faltantes no se interpretan como cero días ni como cartera al día. Historial no disponible muestra error y deshabilita exportación. Los recordatorios externos siguen desactivados. Asignación de responsables, programación de tareas y conexión de recordatorios externos quedan para una siguiente etapa con datos y fuentes verificados; esta entrega no los implementa.

Pruebas: 16 dirigidas aprobadas; suite test:local 1425 aprobadas incluyendo 7 nuevas de agenda. Browser con datos ficticios: navegación de agenda, historial, compromiso, campos requeridos y tarjetas a 390 px sin desbordamiento. La observación del evento de descarga del navegador agotó espera; la selección de filas y mapeo CSV se validaron por código y prueba de dominio, sin afirmar descarga verificada.

Claude aprobó tras corregir las observaciones de filtro de exportación, encabezado numérico y fechas inválidas. Revisión sin datos reales autorizada por Óscar. No se enviaron mensajes a clientes ni se registraron pagos durante las pruebas.

La suite conserva intacto el runner revisado por el control de permisos. La prueba de dominio existente importa las regresiones nuevas de agenda para ejecutarlas en cada despliegue.
