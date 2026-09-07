# Liquidaciones: aprobación y preparación de pagos

## Alcance implementado

- Liquidaciones: pendientes y cuatro aprobadas recientes; historial con filtros de corte desde/hasta y descarga CSV de rentabilidad sobre la base liquidada.
- Acceso al historial desde Reportes e informes. La utilidad se etiqueta provisional mientras falta ejecutivo.
- Cuadro compacto por tienda al importar, con guardar y liquidar o completar después. No asigna responsables inventados.
- Una aprobación del lote. Los botones de cálculo/revisión/aprobación desaparecen tras congelarse.
- Tesorería diferencia estado de liquidación y estado del pago.
- Migración `aprobacion_independiente_cuentas_bonos_diferidos` instalada en KORA: permite aprobar con cuenta/ejecutivo pendientes; preserva revisión y controles financieros de cálculo.
- Bono diferido calculado con el motor de políticas existente, sin borrar bonos conocidos ni duplicar comisión universal. Se conserva PAGAMOS y la aprobación original; se audita el ajuste. La utilidad pendiente no se incorpora al saldo disponible en ALO/PayJoy hasta completar el bono.
- No se ejecutaron pagos. La prueba transaccional con ALO se revirtió: continúa revisada con $120.000 de bonos y $3.148.100 de total. En la prueba de completar Luis pasó a $140.000 y $3.168.100, sin persistir esos cambios.

## Pendiente de autorización específica, NO INSTALADO

`docs/pendientes/completar_destinos_pendientes_tesoreria.sql` fue bloqueado por la protección de producción. Está fuera de migraciones para impedir aplicación accidental. Permite completar cuentas originalmente vacías en órdenes pendientes no autorizadas; no reemplaza cuentas existentes ni pagos cerrados. Ajusta además los totales de obligaciones de destinos de Tesorería para incluir importes pendientes de cuenta y bonos añadidos después.

Las órdenes ya pagadas/conciliadas no se amplían automáticamente. Los conceptos todavía no materializados conservan el pendiente; no se registra un pago ficticio ni se altera el soporte.

## Verificación

- Suite oficial KORA `npm run test:local`; pruebas SQL con triggers de inmutabilidad productivos.
- Chromium y WebKit: asignación compacta, responsive, historial de cuatro recientes, filtros y descarga.
- Prueba ALO en Supabase dentro de BEGIN/ROLLBACK: aprobación sin ejecutivo y preparación posterior, total esperado $3.168.100.
- Advisors: sin nuevas advertencias de seguridad; nueva nota informativa RLS sin política para la tabla privada deliberadamente inaccesible a clientes. No se abrieron permisos de tabla a anon/authenticated.
- `npm test` global incluye fallos preexistentes de AURA y pruebas antiguas ajenas al pipeline KORA; no se declara toda esa suite aprobada.

La autorización bancaria individual existente no se eliminó. No debe confundirse con volver a aprobar el lote.
