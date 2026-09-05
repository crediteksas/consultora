# Krediya: instalación y limpieza verificadas — 2026-09-05

## Alcance autorizado

Oscar pidió eliminar de Liquidaciones únicamente las operaciones Krediya con fecha de venta desde el 31 de agosto de 2026 inclusive (America/Bogota), comprobarlo dos veces y dejar instalado/publicado el motor completo ya acordado. No autorizó aprobar ni pagar lotes automáticamente.

## Limpieza completada

- Eliminados 16 registros importados: 14 reconocidos y 2 excluidos; 16 filas normalizadas de origen, 45 incidencias asociadas y el lote de corte 6 de septiembre.
- Ninguno tenía cálculos, órdenes de pago, aprobaciones, movimientos bancarios o ventas/inventario del ERP vinculados.
- Se conservan 29 operaciones Krediya hasta el 30 de agosto. No se borraron las ventas anteriores al 24 de agosto.
- Primera verificación: consulta nueva en Supabase, cero operaciones y cero cortes Krediya desde el 31 de agosto.
- Segunda verificación: pantalla productiva recargada, un corte Krediya (30 de agosto), 29 fechas visibles y ninguna desde el 31.
- PayJoy permanece con 42 operaciones y crédito de $34.264.900. Los hashes de lotes, operaciones, fuentes e incidencias fuera del objetivo permanecieron idénticos.
- Auditoría de borrado: evento 440, `krediya_eliminar_ventas_desde_20260831_autorizado`. Respaldo privado y archivo Excel original conservados; ningún archivo con datos personales se incorporó al repositorio.

## Motor instalado

Se instalaron las migraciones versionadas `20260905034907_krediya_flujo_tarifario_y_seguimiento.sql` y `20260905182536_krediya_separar_pago_y_seguimiento.sql`. Supabase registró sus ejecuciones como `20260905201041` y `20260905201123`, respectivamente. El motor y la tabla de diferencias antes no existían en producción.

- PAGAMOS pactado menos inicial, una sola vez.
- PVP recibido determina el resultado; diferencias frente al tarifario quedan en un informe independiente con siete días para gestionar.
- Bonos de ejecutivo vigentes y operativos $5.000 de Mayte + $15.000 de Oscar, sin duplicar el bono universal.
- Una revisión del lote por revisor, una aprobación explícita de Gerencia y órdenes agrupadas por beneficiario.
- Cuenta válida obligatoria antes de pagar; datos indispensables siguen validados. Sin aprobación ni pago automáticos.
- Reclasificados como seguimiento no bloqueante 28 avisos de precio y una anotación administrativa del corte restante, sin borrar su historial.
- No se cambió el PVP configurado de Infinix ($1.199.000) ni ninguna tarifa existente durante la instalación.

## Evidencia de pruebas

- Suite `npm run test:local`: 221/221 aprobadas.
- `tests/erp/krediya-v2-rollback.sql`: PASS en Supabase después de instalar. Cálculo, pérdidas, bonos, provisión, seguimiento, reintentos, aprobación sintética, movimientos internos sintéticos, cuenta ausente, permisos y aislamiento PayJoy/ALO.
- Todas las escrituras sintéticas se revirtieron mediante ROLLBACK. No se aprobaron ni pagaron lotes reales.
- Hashes de operaciones, lotes, cálculos, órdenes y movimientos reales idénticos antes/después de instalar y probar.
- Advisors: ninguna advertencia nueva respecto del estado previo.

## Publicación y operación

El motor está instalado, pero el lote real todavía no se calculó: faltan beneficiarios de pago para 13 comercios que agrupan las 22 ventas aliadas restantes. Los comercios están reconocidos; eso no equivale a tener el titular del giro. Los únicos tres beneficiarios aliados hoy registrados pertenecen a otros comercios, por lo que no se reasignaron ni se inventaron identificaciones o cuentas. Los beneficiarios de ejecutivos sí existen. Registrar destinatarios reales es un control indispensable, distinto de confirmar PVP o bonos. El botón «+ Cuenta bancaria» permite seleccionar cada comercio y registrar el beneficiario real.

Comercios pendientes: ALFHAVERSO TECHNOLOGY; ALO BIJAO NUEVA; CELLUXE TEC; CELUVENTAS CERETE; CELUVENTAS MONTERIA; CONTACCEL NUEVA; CREDICEL LA GRANJA; DKCHE; MOVIL FLEX; MOVILES Y PARTES; MOVILPHONE; TECHNOLOGY STORE; TECNO MOVIL MH.

Publicar únicamente por `npm run deploy:kora:production`, desde main limpio, después de este commit. El manifiesto productivo debe identificar el mismo commit y confirmar `runtimeMatchesRelease`; comprobar también el JavaScript de Liquidaciones y la pantalla recargada. No ejecutar el cálculo real como parte de publicar: Maite/revisor lo inicia con «Calcular y enviar a aprobación»; Oscar aprueba después.

La eliminación es sobre los registros actualmente importados; no impone un veto permanente a los siguientes cortes semanales. No reimportar las ventas eliminadas durante este cierre.
