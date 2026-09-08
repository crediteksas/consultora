# Correctivos de auditoría — 8 de septiembre de 2026

## Seguridad de abonos

La función antigua `verificar_abono_y_aplicar_v2` debe rechazar explícitamente sesión nula y perfil ausente/inactivo. Se conserva su lógica financiera. Nueve pruebas de permisos y regresión de abonos aprobadas.

## Krediya: recálculo de comprobación, todavía no aplicado

Autorización del usuario: recalcular el lote completo y conservar Addi pendiente.
Lote de corte 2026-08-30: 29 operaciones (22 aliados y 7 propias).
Se recalculó en SELECT, usando PVP/PAGAMOS del snapshot aprobado, gasto financiero 0,4% y provisión 28%. No se usaron precios nuevos del catálogo ni se ejecutó el motor que elimina órdenes al recalcular.

- Bonos correctos: Alexander 660.000, Mayte 110.000, Oscar 330.000, Luis 0. Total 1.100.000.
- Resultado antes de provisión: 4.292.792,33.
- Provisión: 1.201.981,87.
- Utilidad recalculada: 3.090.810,46.
- Diferencia contra bonos anteriores: 360.000; 255.000 figuran pagados (Luis 220.000 y componente de propias de Mayte 35.000); 105.000 están en la orden pendiente de Oscar.

No se cambiaron pagos, soportes, bonos, liquidaciones ni saldos. El ajuste formal requiere preservar el original y separar la diferencia pagada del bono válido. Se pidió confirmar si Mayte validará los giros y gestionará devolución. No reconocer devolución, compensación ni descuento futuro sin instrucción y evidencia.

## Conciliación bancaria

El módulo Cobros de plataformas ya existe y controla aplicaciones parciales, duplicados e idempotencia. La ausencia de depósitos registrados no se arregla inventando datos. Para poblarlo se requieren el neto esperado documentado y los abonos/extractos bancarios. Las liquidaciones no prueban ingresos bancarios.

## Addi

Pendiente por instrucción del usuario; no se activan tarifas ni pagos.
