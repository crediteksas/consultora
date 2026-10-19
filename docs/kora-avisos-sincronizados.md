# Campanita y confirmaciones de deuda

Los trámites pendientes y el historial de avisos son controles distintos. Leer
un aviso no aprueba, paga, ajusta ni cierra el documento al que se refiere.

La campanita distingue:

- Administradoras activas sin confirmar el saldo de **hoy en Colombia**.
- Reportes de diferencias sin revisar, incluidos días anteriores. Una tienda
  puede tener varios reportes; su número no es el de tiendas sin confirmar hoy.
- Los estados vigentes de ventas, gastos, pagos, traslados, incidencias y tareas
  de inventario, manteniendo las restricciones de acceso existentes.

Las dos cifras de deuda usan la misma respuesta de `listar_confirmaciones_deuda`
por carga. Sus enlaces abren la sección concreta de confirmaciones o diferencias.
La pantalla muestra ambas cifras por separado y distingue una diferencia ya
revisada. Confirmar un día no cierra automáticamente reportes de otros días.

Registrar una revisión refresca la campanita inmediatamente después del guardado,
incluso si falla la recarga de la pantalla. Cambiar de fecha durante una consulta
no presenta una respuesta del día anterior como si fuera la nueva.

Una consulta incompleta o que supera 15 segundos muestra `!`, conserva las
categorías afectadas como **por comprobar** y no suma cifras antiguas como
actuales. Hay un botón Actualizar y fecha de última verificación completa, en
hora de Colombia. Las respuestas inválidas no se convierten silenciosamente
en cero. Los permisos siguen siendo determinados por el servidor.

No hay cambios de esquema ni modificaciones de saldos o movimientos en este parche.
La sincronización entre ventanas, las revisiones fallidas y los errores de lectura
se prueban con datos ficticios, sin efectuar operaciones reales.

## Comprobaciones

- `npm run test:local`
- `node --test tests/erp/kora-notifications-pending.test.mjs tests/erp/kora-incident-center-v1-1.test.mjs tests/erp/confirmacion-deuda-diaria.test.mjs`
- `node --test tests/e2e/kora-notifications-pending-local.test.mjs tests/e2e/kora-avisos-confirmaciones-local.test.mjs`
