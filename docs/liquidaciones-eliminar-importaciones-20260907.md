# Retirar importaciones erróneas desde Gestión

## Uso

- Archivo todavía en vista previa: **Liquidaciones → Nueva importación → Descartar archivo**. No escribe en el servidor.
- Lote guardado: **Liquidaciones → Ver detalle → Eliminar importación**. Muestra el nombre original, la plataforma y el corte; exige motivo y confirmación del lote completo.
- Permiso: perfil activo con capacidad `revisor` (incluida Mayte), validado en servidor. No depende de Oscar para un lote provisional.

## Límites y recuperación

Admite estados importada, validada, con novedades, calculada y revisada, siempre que nunca se hayan aprobado ni autorizado/programado pagos. Bloquea destinos de Tesorería, compensaciones, cobros, ajustes, movimientos, soportes, créditos sincronizados y gestiones vinculadas. Esos casos requieren revisar la relación; no se borran para facilitar una recarga.

Retira el lote y sus filas/cálculos provisionales en una sola transacción. Libera la huella del archivo para permitir una nueva importación. No cambia cuentas, clientes, caja, inventario ni movimientos financieros. Conserva el objeto original de Storage y un snapshot privado con actor, fecha y motivo. El evento `liquidacion_importacion_retirada` permanece en `audit_log`. Repetir la petición no repite eliminaciones. La recuperación desde el respaldo es administrativa, no un botón de recreación de pagos.

La vista previa se invalida al cambiar archivo, plataforma o fechas. Cerrar o descartar limpia los datos locales; no se admite guardar una validación anterior ni un archivo sin operaciones.

## Verificación

- 23 pruebas SQL locales: permisos, estados, auditoría, doble clic/reintento, nueva carga, órdenes protegidas, créditos/gestiones y rollback ante dependencias.
- 2 pruebas de navegador con datos ficticios: Chrome y WebKit, 390×844, 844×390, 768×1024 y 1280×900; confirmación, cancelación, error de servidor, estado recién aprobado y limpieza de vista previa.
- Estas pruebas NO importan ni eliminan archivos en producción.

## Archivo reportado de ALO Credit

Consulta de producción del 7 de septiembre de 2026, alrededor de 10:28 a. m. Bogotá: 9 lotes, ninguno de ALO, ninguna importación creada hoy. Tampoco hay objetos de Storage creados hoy ni filas en `importaciones_financiera`. No se ha eliminado un archivo real porque el intento reportado todavía no está identificado. Se solicitó el nombre o una captura. Podría haber fallado antes de guardarse; no se toma esta hipótesis como hecho.
