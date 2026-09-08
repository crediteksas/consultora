# Correctivos de auditoría — 8 de septiembre de 2026

## Seguridad de abonos

La función antigua `verificar_abono_y_aplicar_v2` debe rechazar explícitamente sesión nula y perfil ausente/inactivo. Se conserva su lógica financiera. Nueve pruebas de permisos y regresión de abonos aprobadas.

## Krediya: rectificación aplicada en producción

Autorización del usuario: recalcular el lote completo y conservar Addi pendiente.
Lote de corte 2026-08-30: 29 operaciones (22 aliados y 7 propias).
Se recalculó el lote completo usando PVP/PAGAMOS del snapshot aprobado, gasto financiero 0,4% y provisión 28%. No se usaron precios nuevos del catálogo ni se ejecutó el motor que elimina órdenes al recalcular. Aplicación confirmada: 2026-09-08 15:23:28 UTC.

- Bonos correctos: Alexander 660.000, Mayte 110.000, Oscar 330.000, Luis 0. Total 1.100.000.
- Resultado antes de provisión: 4.292.792,33.
- Provisión: 1.201.981,87.
- Utilidad recalculada: 3.090.810,46.
- Diferencia contra bonos anteriores: 360.000; 255.000 figuran pagados (Luis 220.000 y componente de propias de Mayte 35.000); 105.000 están en la orden pendiente de Oscar.

Se anularon 36 devengos incorrectos conservando su importe original para auditoría. Quedan 66 bonos vigentes. La orden pendiente de Oscar pasó de 435.000 a 330.000. Total correcto del lote: 11.128.667. Se conservaron los pagos realizados, sus soportes, detalles y movimientos de Tesorería; verificación por igualdad completa contra el archivo anterior. El permiso excepcional de rectificación quedó revocado al completar la transacción.

Los 255.000 figuran como diferencia pagada pendiente de validar soportes por Mayte, según instrucción expresa. No se reconoció devolución, compensación ni descuento futuro. No se acreditó dinero disponible. Conciliación aplicada: bonos correctos 1.100.000 + diferencia pagada 255.000 = pagos registrados a ejecutivos 1.025.000 + pendiente 330.000.

Migraciones y pruebas: `56c456b` y `10188fd`. Prueba SQL local de 29 créditos y simulación transaccional con rollback sobre esquema real antes de aplicar. El primer ensayo real detectó autoría obligatoria del ajuste y se revirtió completo; la migración siguiente incorporó al aprobador del lote. Reportes excluyen bonos anulados/rechazados; Tesorería muestra el ajuste pendiente por separado.

## Conciliación bancaria

El módulo Cobros de plataformas ya existe y controla aplicaciones parciales, duplicados e idempotencia. La ausencia de depósitos registrados no se arregla inventando datos. Para poblarlo se requieren el neto esperado documentado y los abonos/extractos bancarios. Las liquidaciones no prueban ingresos bancarios.

## Addi

Pendiente por instrucción del usuario; no se activan tarifas ni pagos.
