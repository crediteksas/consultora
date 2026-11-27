# Alcance del candidato de Cartera

Se conservan dos permisos de negocio que ya existen; ubicarlos en Aliados no los convierte en un permiso general de Aliados.

| Área | Lectura | Gestión |
|---|---|---|
| Cartera clásica | Solo los créditos y eventos del origen permitido por `creditos_cartera_puede_leer`. El perfil dedicado conserva su origen; no recibe lectura clásica de otras tiendas. | No se añade ningún RPC de pagos ni cambios de saldo. |
| Seguimiento de cortes KrediYA | El permiso existente `manage` de Cartera habilita la cola de seguimiento de **todas las tiendas y aliados** presentes en los cortes. Incluye corte, historial de cliente, gestiones y libro común de provisiones. Un permiso solo `read` no habilita esta área. | Gestiones y solicitudes de provisión en cualquier operación vinculada a un corte revisado, del mismo conjunto global. No importa archivos, concilia, autoriza ni ejecuta pagos. |

Esta distinción conserva las políticas ya publicadas `cobra_quality_operator()` y `creditos_cartera_puede_leer(text)`; no amplía la cartera clásica. Se explica en pantalla. Las pruebas con dos orígenes comprueban el corte y su historial, lecturas de gestiones y solicitudes en ambos orígenes, y su denegación al revocar `manage`. No se presenta una prueba de ausencia de corte como prueba de aislamiento por origen.

Se conserva el enlace existente de las gestiones: un seguimiento de KrediYA de otro origen se guarda por `operation_id` y puede quedar con `obligation_id = NULL`, porque ese crédito clásico no es visible para la cuenta. La prueba de dos orígenes verifica ese NULL expresamente. Se ve en el historial de KrediYA; no actualiza `last_collection_at` de la vista clásica ni da acceso por obligación a otra tienda. No se amplía el lector clásico ni se añade un helper con privilegios para cambiar ese comportamiento. Asociarlo a cartera clásica en otra versión requiere definir y revisar ese cambio; no se anuncia como resuelto aquí.

El rol nuevo no implica autoridad sobre provisiones. Solo el UUID individual de Óscar que se verifique en una activación separada podrá ser autorizador; la tabla de autoridad permanece vacía en la preparación. No se modifica ninguna cuenta real por esta decisión.

El catálogo y las publicaciones tienen control obligatorio en las pruebas de upgrade/rebuild del pipeline. Cada migración posterior debe ejecutar `cartera_assert_coverage()` dentro de su transacción antes del commit; una tabla nueva sin política se revierte. No hay un disparador DDL privilegiado y no se garantiza protección frente a un administrador que omita deliberadamente ese proceso. Por eso no se activa el perfil antes de integrar y verificar el gate del pipeline y el procedimiento de migraciones. La configuración revisada no admite publicaciones Realtime; habilitar una requiere una revisión específica.
