# Liquidaciones de tiendas propias y experiencia administrativa

## Alcance

Extender el motor actual de Liquidaciones sin tablas paralelas. Cada archivo conserva operaciones propias y aliadas. Los aliados mantienen sus políticas y conciliaciones actuales; las tiendas propias se calculan con un `Pagamos` definido exclusivamente por Óscar.

## Datos y seguridad

`liquidation_operations` conservará snapshots de inicial de plataforma, inicial KORA obtenida de la venta o crédito asociado al IMEI, costo congelado, Pagamos y resultados. Una RPC resolverá IMEI, pertenencia, venta/crédito e inicial. Otra RPC permitirá a Óscar guardar Pagamos antes de aprobación. Maite podrá justificar y resolver diferencias de inicial. La aprobación bloqueará IMEI inválido, diferencias sin revisar, Pagamos vacío, políticas inválidas y pagos descuadrados. Los snapshots serán inmutables después de aprobar.

## Cálculos

PayJoy propia: total real = financiado - inicial KORA; diferencia = inicial KORA - inicial plataforma; pago tienda = Pagamos - inicial KORA - diferencia; utilidad Creditek = total real - pago tienda; utilidad tienda = Pagamos - costo.

ALO propia: diferencia = inicial plataforma - inicial KORA; pago tienda = Pagamos - diferencia - inicial plataforma; utilidad Creditek = monto total - pago tienda; utilidad tienda = Pagamos - costo.

## Interfaz

La pantalla existente usará formateadores centrales COP y fecha Colombia, filtros Todas/Tiendas/Aliados, resúmenes separados y acciones visibles por rol. Pagos y auditoría mostrarán nombres, conceptos y descripciones; UUID y JSON quedarán ocultos en un detalle técnico cerrado. Óscar editará Pagamos y aprobará; Maite revisará y resolverá novedades.

## Validación

Pruebas puras cubrirán formatos y fórmulas. Pruebas SQL reales cubrirán permisos, snapshots, bloqueo y aprobación. La validación visual se realizará autenticada contra Supabase local con PayJoy y ALO históricos. No se aplicará ni desplegará nada fuera del entorno local.
